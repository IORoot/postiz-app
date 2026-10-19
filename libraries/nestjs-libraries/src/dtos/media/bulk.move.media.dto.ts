import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { BULK_MEDIA_MAX } from '@gitroom/nestjs-libraries/dtos/media/bulk.delete.media.dto';

export class BulkMoveMediaDto {
  @ValidateIf((body: BulkMoveMediaDto) => !body.all)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_MEDIA_MAX)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ids?: string[];

  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  // With `all`, limits the move to this folder. Absent means the whole library.
  @IsOptional()
  @IsString()
  folderId?: string;

  // Absent moves the media out of every folder.
  @IsOptional()
  @IsString()
  targetFolderId?: string;
}
