import { IsString, IsUrl, IsBoolean, IsOptional, IsNotEmpty, MinLength } from 'class-validator';

export class UpsertSamlConfigDto {
  @IsUrl({ require_tld: false })
  idpEntryPoint!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  idpCert!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  attrEmail?: string;

  @IsString()
  @IsOptional()
  attrFirstName?: string;

  @IsString()
  @IsOptional()
  attrLastName?: string;
}
