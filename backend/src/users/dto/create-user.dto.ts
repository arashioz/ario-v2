import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class CreateUserDto {
  @IsString({ message: 'نام کاربری باید رشته باشد' })
  @IsNotEmpty({ message: 'نام کاربری الزامی است' })
  username: string;

  @IsString({ message: 'رمز عبور باید رشته باشد' })
  @MinLength(6, { message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' })
  password: string;

  @IsString({ message: 'نام و نام خانوادگی الزامی است' })
  @IsNotEmpty({ message: 'نام و نام خانوادگی الزامی است' })
  fullName: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'نقش کاربری نامعتبر است (admin یا marketer)' })
  role?: Role;
}
