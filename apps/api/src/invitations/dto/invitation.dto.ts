import { IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvitationDto {
  @ApiProperty({ example: 'colleague@company.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ['ADMIN', 'SECURITY_ENGINEER', 'DEVELOPER', 'VIEWER'], default: 'VIEWER' })
  @IsEnum(['ADMIN', 'SECURITY_ENGINEER', 'DEVELOPER', 'VIEWER'])
  role!: 'ADMIN' | 'SECURITY_ENGINEER' | 'DEVELOPER' | 'VIEWER';
}
