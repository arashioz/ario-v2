import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedInitialUsers();
  }

  private async seedInitialUsers() {
    try {
      const adminUsername =
        this.configService.get<string>('ADMIN_DEFAULT_USERNAME') || 'admin';
      const adminPassword =
        this.configService.get<string>('ADMIN_DEFAULT_PASSWORD') || 'admin123';
      const adminName =
        this.configService.get<string>('ADMIN_DEFAULT_NAME') || 'مدیر سیستم';

      const existingAdmin = await this.userModel.findOne({
        username: adminUsername.toLowerCase(),
      });

      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await this.userModel.create({
          username: adminUsername.toLowerCase(),
          password: hashedPassword,
          fullName: adminName,
          role: Role.ADMIN,
          isActive: true,
        });
        this.logger.log(
          `Initial Admin user created: [username: ${adminUsername}, role: admin]`,
        );
      }

      const marketerUsername =
        this.configService.get<string>('MARKETER_DEFAULT_USERNAME') || 'marketer';
      const marketerPassword =
        this.configService.get<string>('MARKETER_DEFAULT_PASSWORD') ||
        'marketer123';
      const marketerName =
        this.configService.get<string>('MARKETER_DEFAULT_NAME') ||
        'بازاریاب آریو';

      const existingMarketer = await this.userModel.findOne({
        username: marketerUsername.toLowerCase(),
      });

      if (!existingMarketer) {
        const hashedPassword = await bcrypt.hash(marketerPassword, 10);
        await this.userModel.create({
          username: marketerUsername.toLowerCase(),
          password: hashedPassword,
          fullName: marketerName,
          role: Role.MARKETER,
          isActive: true,
        });
        this.logger.log(
          `Initial Marketer user created: [username: ${marketerUsername}, role: marketer]`,
        );
      }
    } catch (error) {
      this.logger.error('Error seeding initial users', error);
    }
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username: username.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }
    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.findByUsername(createUserDto.username);
    if (existing) {
      throw new ConflictException('نام کاربری قبلا ثبت شده است');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const createdUser = new this.userModel({
      ...createUserDto,
      username: createUserDto.username.toLowerCase(),
      password: hashedPassword,
      role: createUserDto.role || Role.MARKETER,
      isActive: true,
    });

    return createdUser.save();
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().select('-password').sort({ createdAt: 1 }).exec();
  }

  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const user = await this.findById(id);
    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new BadRequestException('رمز فعلی اشتباه است');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('رمز جدید باید حداقل ۶ کاراکتر باشد');
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return { message: 'رمز عبور تغییر کرد' };
  }

  async updateUser(
    id: string,
    actorId: string,
    body: { fullName?: string; phoneNumber?: string; role?: Role; isActive?: boolean; password?: string; username?: string },
  ): Promise<UserDocument> {
    const user = await this.findById(id);
    if (body.fullName !== undefined) {
      if (!body.fullName.trim()) throw new BadRequestException('نام الزامی است');
      user.fullName = body.fullName.trim();
    }
    if (body.phoneNumber !== undefined) user.phoneNumber = body.phoneNumber.trim();
    if (body.username !== undefined && body.username.trim().toLowerCase() !== user.username) {
      const username = body.username.trim().toLowerCase();
      if (!username) throw new BadRequestException('نام کاربری الزامی است');
      if (await this.findByUsername(username)) throw new ConflictException('نام کاربری قبلا ثبت شده است');
      user.username = username;
    }
    const demotingSelf = String(user._id) === actorId && (body.isActive === false || (body.role && body.role !== Role.ADMIN));
    if (demotingSelf) throw new BadRequestException('نمی‌توانید دسترسی مدیر خودتان را بردارید');
    if (body.role !== undefined) {
      if (!Object.values(Role).includes(body.role)) throw new BadRequestException('نقش نامعتبر است');
      user.role = body.role;
    }
    if (body.isActive !== undefined) user.isActive = !!body.isActive;
    if (body.password) {
      if (body.password.length < 6) throw new BadRequestException('رمز عبور باید حداقل ۶ کاراکتر باشد');
      user.password = await bcrypt.hash(body.password, 10);
    }
    await user.save();
    return this.userModel.findById(id).select('-password').exec() as Promise<UserDocument>;
  }
}
