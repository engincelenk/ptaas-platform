import { IsString, IsOptional, IsArray, IsUrl, MinLength, MaxLength, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUrl({}, { each: true })
  targets!: string[];
}
