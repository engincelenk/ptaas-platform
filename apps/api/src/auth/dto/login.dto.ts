import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'max@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

export class LoginMfaDto {
  @ApiProperty({ description: '6-digit TOTP code' })
  @IsString()
  @MinLength(6)
  totpCode!: string;

  @ApiProperty({ description: 'Short-lived temp token from step 1 login' })
  @IsString()
  tempToken!: string;
}
