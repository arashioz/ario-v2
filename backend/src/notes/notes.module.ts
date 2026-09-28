import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShopNote, ShopNoteSchema } from './schemas/shop-note.schema';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: ShopNote.name, schema: ShopNoteSchema }])],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
