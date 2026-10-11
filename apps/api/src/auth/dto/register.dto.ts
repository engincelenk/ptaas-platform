import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Max Mustermann' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'max@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Sup3r$ecureP@ss!' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  // At least: 1 uppercase, 1 lowercase, 1 digit, 1 special char
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{12,}$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password!: string;

  @ApiProperty({ example: 'acme-corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Organization slug may only contain lowercase letters, digits, and hyphens',
  })
  organizationSlug!: string;

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  organizationName!: string;
}
