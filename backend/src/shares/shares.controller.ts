import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SharesService } from './shares.service';
import type { ShareKind } from './schemas/share-link.schema';

@Controller('shares')
@UseGuards(JwtAuthGuard)
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Post()
  create(@Body() body: { kind: ShareKind; params?: Record<string, string> }, @Request() req: any) {
    return this.shares.create(body?.kind, body?.params || {}, req.user?.fullName || req.user?.username || 'کاربر سیستم');
  }

  @Get()
  list() {
    return this.shares.list();
  }

  @Delete(':token')
  remove(@Param('token') token: string) {
    return this.shares.remove(token);
  }

  @Post(':token/pdf')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  upload(@Param('token') token: string, @UploadedFile() file: any) {
    return this.shares.savePdf(token, file);
  }
}

/** No auth: whoever has the link can view the report and download its PDF. */
@Controller('public/shares')
export class PublicSharesController {
  constructor(private readonly shares: SharesService) {}

  @Get(':token')
  data(@Param('token') token: string) {
    return this.shares.data(token);
  }

  @Get(':token/pdf')
  async pdf(@Param('token') token: string, @Res() res: any) {
    const { path, title } = await this.shares.pdfPath(token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${token}.pdf"; filename*=UTF-8''${encodeURIComponent(title)}.pdf`);
    res.sendFile(path);
  }
}
