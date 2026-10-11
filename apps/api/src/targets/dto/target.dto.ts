import { IsString, IsEnum, Matches, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTargetDto {
  @ApiProperty({
    enum: ['DOMAIN', 'SUBDOMAIN', 'IP', 'IP_RANGE', 'URL'],
    example: 'DOMAIN',
  })
  @IsEnum(['DOMAIN', 'SUBDOMAIN', 'IP', 'IP_RANGE', 'URL'])
  type!: 'DOMAIN' | 'SUBDOMAIN' | 'IP' | 'IP_RANGE' | 'URL';

  @ApiProperty({
    example: 'example.com',
    description: 'Domain, IP, CIDR, or URL depending on type',
  })
  @IsString()
  @IsNotEmpty()
  value!: string;
}

export class StartVerificationDto {
  @ApiProperty({ enum: ['DNS_TXT', 'HTTP_FILE', 'META_TAG'] })
  @IsEnum(['DNS_TXT', 'HTTP_FILE', 'META_TAG'])
  method!: 'DNS_TXT' | 'HTTP_FILE' | 'META_TAG';
}
