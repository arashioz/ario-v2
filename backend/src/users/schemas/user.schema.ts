import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

export type UserDocument = User & Document;

@Schema({
  timestamps: true,
  toJSON: {
    transform: (doc, ret: any) => {
      delete ret.password;
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  username: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ trim: true })
  phoneNumber?: string;

  @Prop({
    type: String,
    enum: Object.values(Role),
    default: Role.MARKETER,
  })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;

  /** Widget ids on the home tab, in order. Empty means the shared default template. */
  @Prop({ type: [String], default: [] })
  homeLayout: string[];

  /** Company warehouses this user wants on the home card. Empty follows the shop setting. */
  @Prop({ type: [String], default: [] })
  homeWarehouses: string[];

  @Prop({ default: 0 })
  salesTargetAmount: number;

  @Prop({ default: 0 })
  salesTargetKg: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
