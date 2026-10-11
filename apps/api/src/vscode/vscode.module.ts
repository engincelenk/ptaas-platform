import { Module } from '@nestjs/common';
import { VscodeController } from './vscode.controller';

@Module({
  controllers: [VscodeController],
})
export class VscodeModule {}
