"""LangGraph-based autonomous scan strategy agent.

Graph: fingerprint → analyse → plan → done
  fingerprint:  HTTP-based technology detection
  analyse:      Claude reasons about what scans are warranted
  plan:         Structures output as ScanPlanStep[]
  done:         POSTs result back to API
"""
from __future__ import annotations

import json
import os
import asyncio
from typing import Any, TypedDict

import httpx
import structlog
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

from fingerprinter import fingerprint

log = structlog.get_logger()

API_BASE_URL = os.environ.get("API_INTERNAL_URL", "http://api:3000/api/v1")
SCANNER_API_KEY = os.environ.get("SCANNER_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

llm = ChatAnthropic(
    model="claude-haiku-4-5-20251001",
    api_key=ANTHROPIC_API_KEY,
    max_tokens=2048,
    temperature=0,
)

SYSTEM_PROMPT = """You are a security scan strategy planner for a penetration testing platform.
You will receive:
1. Technology fingerprint (detected stack, headers, status code)
2. Previous findings summary (if any)

Your task: output a JSON array of scan steps, ordered by priority (1 = highest).

Each step MUST follow this schema exactly:
{
  "type": "QUICK" | "FULL" | "WEB_CRAWL" | "API_SCAN",
  "tags": ["nuclei-tag1", "nuclei-tag2"],  // optional, for QUICK/FULL
  "severities": ["critical", "high"],       // optional filter
  "priority": 1,
  "rationale": "one sentence why"
}

Rules:
- Always include at least one QUICK scan for CVEs specific to detected tech
- Add WEB_CRAWL if the site appears to be JS-heavy (React, Angular, Next.js detected)
- Add API_SCAN only if Swagger/OpenAPI endpoint is detected
- Add FULL scan if target looks complex (multiple frameworks, high-value target)
- Maximum 4 steps total
- nuclei tags: use "wordpress", "cves", "misconfigurations", "exposures", "xss", "sqli",
  "lfi", "ssrf", "rce", "auth-bypass", "default-logins", "panels", "apache", "nginx",
  "iis", "php", "java", "spring", "django", "laravel"

Output ONLY the JSON array, no markdown, no explanation."""


class StrategyState(TypedDict):
    strategy_id: str
    target_url: str
    previous_findings: str
    fingerprint: dict[str, Any]
    plan: list[dict]
    reasoning: str
    error: str | None


async def _node_fingerprint(state: StrategyState) -> StrategyState:
    log.info("strategy.fingerprint", strategy_id=state["strategy_id"])
    fp = await fingerprint(state["target_url"])
    return {**state, "fingerprint": fp}


async def _node_analyse(state: StrategyState) -> StrategyState:
    log.info("strategy.analyse", strategy_id=state["strategy_id"])
    fp = state["fingerprint"]

    tech_list = ", ".join(fp.get("technologies", [])) or "none detected"
    headers_snippet = json.dumps(dict(list(fp.get("headers", {}).items())[:10]), indent=2)

    user_msg = f"""Target: {state["target_url"]}
Status: {fp.get("statusCode")}
Technologies: {tech_list}
Key headers:
{headers_snippet}

Previous findings (last 20):
{state["previous_findings"] or "None — first scan"}

Generate the scan plan JSON array now."""

    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_msg),
    ])

    raw = response.content.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        plan = json.loads(raw)
        if not isinstance(plan, list):
            raise ValueError("Expected a JSON array")
        reasoning = f"Tech stack: {tech_list}. Generated {len(plan)} scan steps."
    except Exception as exc:
        log.error("strategy.parse_error", error=str(exc), raw=raw[:200])
        plan = [
            {"type": "QUICK", "tags": ["cves", "misconfigurations"], "priority": 1,
             "rationale": "Fallback QUICK scan — LLM response parse error"}
        ]
        reasoning = f"Parse error: {exc}. Fallback plan applied."

    return {**state, "plan": plan, "reasoning": reasoning}


async def _node_post_result(state: StrategyState) -> StrategyState:
    strategy_id = state["strategy_id"]
    log.info("strategy.post_result", strategy_id=strategy_id, steps=len(state["plan"]))

    payload = {
        "status": "COMPLETED",
        "fingerprint": state["fingerprint"],
        "plan": state["plan"],
        "reasoning": state["reasoning"],
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            f"{API_BASE_URL}/internal/strategies/{strategy_id}/result",
            json=payload,
            headers={"x-scanner-api-key": SCANNER_API_KEY},
        )

    return state


async def _node_post_error(state: StrategyState) -> StrategyState:
    strategy_id = state["strategy_id"]
    log.error("strategy.failed", strategy_id=strategy_id, error=state.get("error"))

    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            f"{API_BASE_URL}/internal/strategies/{strategy_id}/result",
            json={"status": "FAILED", "errorMessage": state.get("error", "Unknown error")},
            headers={"x-scanner-api-key": SCANNER_API_KEY},
        )

    return state


def _route_after_analyse(state: StrategyState) -> str:
    return "error" if state.get("error") else "post"


def build_strategy_graph():
    graph = StateGraph(StrategyState)
    graph.add_node("fingerprint", _node_fingerprint)
    graph.add_node("analyse", _node_analyse)
    graph.add_node("post", _node_post_result)
    graph.add_node("error", _node_post_error)

    graph.set_entry_point("fingerprint")
    graph.add_edge("fingerprint", "analyse")
    graph.add_conditional_edges("analyse", _route_after_analyse, {"post": "post", "error": "error"})
    graph.add_edge("post", END)
    graph.add_edge("error", END)

    return graph.compile()


_strategy_graph = build_strategy_graph()


async def run_strategy(
    strategy_id: str,
    target_url: str,
    previous_findings: str = "",
) -> None:
    """Entry point called from strategy_consumer."""
    initial_state: StrategyState = {
        "strategy_id": strategy_id,
        "target_url": target_url,
        "previous_findings": previous_findings,
        "fingerprint": {},
        "plan": [],
        "reasoning": "",
        "error": None,
    }
    try:
        await _strategy_graph.ainvoke(initial_state)
    except Exception as exc:
        log.error("strategy.graph_error", strategy_id=strategy_id, error=str(exc))
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{API_BASE_URL}/internal/strategies/{strategy_id}/result",
                json={"status": "FAILED", "errorMessage": str(exc)},
                headers={"x-scanner-api-key": SCANNER_API_KEY},
            )
