import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { NOTE_COLORS } from '../schemas/shop-note.schema';
import type { NoteColor } from '../schemas/shop-note.schema';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'متن یادداشت خالی است' })
  @MaxLength(1000)
  text: string;

  @IsOptional()
  @IsIn(NOTE_COLORS)
  color?: NoteColor;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'متن یادداشت خالی است' })
  @MaxLength(1000)
  text?: string;

  @IsOptional()
  @IsIn(NOTE_COLORS)
  color?: NoteColor;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
