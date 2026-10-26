import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MediaDurationItemDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsNumber()
  @Min(0)
  @Max(60 * 60 * 24 * 7)
  duration: number;
}

export class SaveMediaDurationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MediaDurationItemDto)
  items: MediaDurationItemDto[];
}
