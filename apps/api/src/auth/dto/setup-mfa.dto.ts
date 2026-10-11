import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyMfaSetupDto {
  @ApiProperty({ description: 'TOTP code to confirm secret was saved correctly' })
  @IsString()
  @Length(6, 6)
  totpCode!: string;
}

export class UseBackupCodeDto {
  @ApiProperty({ description: '8-character backup code' })
  @IsString()
  @Length(8, 8)
  backupCode!: string;

  @ApiProperty()
  @IsString()
  tempToken!: string;
}
