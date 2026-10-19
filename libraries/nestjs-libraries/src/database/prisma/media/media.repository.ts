import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { extname } from 'path';
import { CreateMediaFolderDto } from '@gitroom/nestjs-libraries/dtos/media/create.media.folder.dto';
import { RenameMediaFolderDto } from '@gitroom/nestjs-libraries/dtos/media/rename.media.folder.dto';

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav']);

@Injectable()
export class MediaRepository {
  constructor(
    private _media: PrismaRepository<'media'>,
    private _mediaFolder: PrismaRepository<'mediaFolder'>,
  ) {}

  saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
  ) {
    return this._media.model.media.create({
      data: {
        organization: {
          connect: {
            id: org,
          },
        },
        name: fileName,
        path: filePath,
        originalName: originalName || null,
        ...(AUDIO_EXT.has(extname(fileName).toLowerCase()) ? { type: 'audio' } : {}),
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
      },
    });
  }

  startProcessing(org: string, id: string) {
    return this._media.model.media.update({
      where: { id, organizationId: org },
      data: { status: 'processing', processingError: null },
      select: { id: true, status: true },
    });
  }

  finishProcessing(
    org: string,
    id: string,
    data: { name?: string; path?: string; fileSize?: number; error?: string }
  ) {
    return this._media.model.media.update({
      where: { id, organizationId: org },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.path ? { path: data.path } : {}),
        ...(data.fileSize ? { fileSize: data.fileSize } : {}),
        status: data.error ? 'failed' : 'ready',
        processingError: data.error || null,
      },
      select: { id: true, status: true },
    });
  }

  getMediaStatus(org: string, id: string) {
    return this._media.model.media.findFirst({
      where: {
        id,
        organizationId: org,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
        processingError: true,
      },
    });
  }

  createRendering(org: string, originalName: string) {
    return this._media.model.media.create({
      data: {
        organization: { connect: { id: org } },
        name: 'rendering.mp4',
        path: '',
        originalName,
        type: 'video',
        status: 'rendering',
      },
      select: { id: true, status: true },
    });
  }

  getMediaByIds(org: string, ids: string[]) {
    return this._media.model.media.findMany({
      where: {
        organizationId: org,
        id: { in: ids },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
      },
    });
  }

  getMediaById(id: string) {
    return this._media.model.media.findUnique({
      where: {
        id,
      },
    });
  }

  deleteMedia(org: string, id: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  // either the given ids, or every media of the library matching the search
  getMediaForDelete(
    org: string,
    filter: { ids?: string[]; all?: boolean; search?: string; folderId?: string }
  ) {
    const trimmedSearch = filter.search?.trim();
    return this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        // still being normalized by a workflow, like in the library list
        status: { not: 'processing' },
        ...(filter.all && filter.folderId ? { folderId: filter.folderId } : {}),
        ...(filter.all
          ? trimmedSearch
            ? {
                originalName: {
                  contains: trimmedSearch,
                  mode: 'insensitive' as const,
                },
              }
            : {}
          : { id: { in: filter.ids || [] } }),
      },
      select: {
        id: true,
        path: true,
        thumbnail: true,
      },
    });
  }

  deleteManyMedia(org: string, ids: string[]) {
    return this._media.model.media.updateMany({
      where: {
        id: { in: ids },
        organizationId: org,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  async getMedia(
    org: string,
    page: number,
    search?: string,
    folderId?: string,
  ) {
    const pageNum = (page || 1) - 1;
    const trimmedSearch = search?.trim();
    const searchFilter: Prisma.MediaWhereInput = trimmedSearch
      ? {
          originalName: {
            contains: trimmedSearch,
            mode: 'insensitive',
          },
        }
      : {};
    const folderFilter: Prisma.MediaWhereInput = folderId ? { folderId } : {};
    const where: Prisma.MediaWhereInput = {
      organizationId: org,
      deletedAt: null,
      // still being normalized: it shows up once the workflow releases it
      status: { not: 'processing' },
      ...searchFilter,
      ...folderFilter,
    };
    const pages = Math.ceil(
      (await this._media.model.media.count({ where })) / 18
    );
    const results = await this._media.model.media.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
        createdAt: true,
        status: true,
        processingError: true,
        type: true,
        folderId: true,
      },
      skip: pageNum * 18,
      take: 18,
    });

    return {
      pages,
      results,
    };
  }

  getFolders(org: string) {
    return this._mediaFolder.model.mediaFolder.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  createFolder(org: string, data: CreateMediaFolderDto) {
    return this._mediaFolder.model.mediaFolder.create({
      data: {
        name: data.name,
        ...(data.parentId
          ? { parent: { connect: { id: data.parentId } } }
          : {}),
        organization: {
          connect: {
            id: org,
          },
        },
      },
    });
  }

  renameFolder(org: string, id: string, data: RenameMediaFolderDto) {
    return this._mediaFolder.model.mediaFolder.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        name: data.name,
      },
    });
  }

  async deleteFolder(org: string, id: string) {
    await this._media.model.media.updateMany({
      where: {
        folderId: id,
        organizationId: org,
      },
      data: {
        folderId: null,
      },
    });

    return this._mediaFolder.model.mediaFolder.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  moveMedia(org: string, id: string, folderId?: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        folderId: folderId || null,
      },
    });
  }
}
