import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ShopNote, ShopNoteDocument } from './schemas/shop-note.schema';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';

@Injectable()
export class NotesService {
  constructor(@InjectModel(ShopNote.name) private noteModel: Model<ShopNoteDocument>) {}

  /** Open notes first (pinned on top), then done ones; newest first within each group. */
  findAll() {
    return this.noteModel.find().sort({ done: 1, pinned: -1, sortOrder: 1, createdAt: -1 }).lean();
  }

  async create(dto: CreateNoteDto, byName: string) {
    const top = await this.noteModel.findOne({ done: false }).sort({ sortOrder: 1 }).select('sortOrder').lean();
    return this.noteModel.create({ ...dto, createdBy: byName, sortOrder: (top?.sortOrder ?? 1) - 1 });
  }

  async update(id: string, dto: UpdateNoteDto) {
    const set: Record<string, unknown> = { ...dto };
    if (dto.done !== undefined) set.doneAt = dto.done ? new Date() : null;
    const note = await this.noteModel.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!note) throw new NotFoundException('یادداشت پیدا نشد');
    return note;
  }

  async remove(id: string) {
    const res = await this.noteModel.findByIdAndDelete(id);
    if (!res) throw new NotFoundException('یادداشت پیدا نشد');
    return { success: true };
  }

  async clearDone() {
    const res = await this.noteModel.deleteMany({ done: true });
    return { deleted: res.deletedCount };
  }
}
