import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'نام کاربری باید رشته باشد' })
  @IsNotEmpty({ message: 'نام کاربری الزامی است' })
  username: string;

  @IsString({ message: 'رمز عبور باید رشته باشد' })
  @IsNotEmpty({ message: 'رمز عبور الزامی است' })
  password: string;
}
