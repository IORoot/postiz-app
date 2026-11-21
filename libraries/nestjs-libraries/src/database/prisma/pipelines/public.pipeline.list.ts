import { isActivePipelineIntegration } from './pipeline.repository';

export interface PublicPipelineChannelSource {
  id: string;
  name: string;
  identifier: string;
  disabled?: boolean;
  deletedAt?: Date | string | null;
  linkCreatedAt: Date;
}

export interface PublicPipelineSource {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
  nextSlot?: Date;
  channels: PublicPipelineChannelSource[];
}

export interface PublicPipelineChannel {
  id: string;
  name: string;
  identifier: string;
}

export interface PublicPipeline {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
  nextSlot: string | null;
  channels: PublicPipelineChannel[];
}

export function toPublicPipelines(
  pipelines: PublicPipelineSource[]
): PublicPipeline[] {
  return pipelines.map((pipeline) => ({
    id: pipeline.id,
    name: pipeline.name,
    timezone: pipeline.timezone,
    active: pipeline.active,
    nextSlot: pipeline.nextSlot ? pipeline.nextSlot.toISOString() : null,
    channels: pipeline.channels
      .filter((channel) => isActivePipelineIntegration(channel))
      .sort(
        (first, second) =>
          first.linkCreatedAt.getTime() - second.linkCreatedAt.getTime()
      )
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        identifier: channel.identifier,
      })),
  }));
}
