export type PublicChannelSettingsCatalog = {
  rules: Record<string, string>;
  tools: Record<string, unknown>;
  schemas: Record<string, unknown>;
  providers: {
    identifier: string;
    dto?: { name: string };
    maxLength: (verified?: boolean) => number;
  }[];
};

export function toPublicPipelines(
  pipelines: {
    id: string;
    name: string;
    channels: {
      id: string;
      name: string;
      identifier: string;
      additionalSettings: string;
    }[];
  }[],
  catalog: PublicChannelSettingsCatalog
) {
  return pipelines.map((pipeline) => ({
    id: pipeline.id,
    name: pipeline.name,
    channels: pipeline.channels.map((channel) =>
      toPublicChannel(channel, catalog)
    ),
  }));
}

function toPublicChannel(
  channel: {
    id: string;
    name: string;
    identifier: string;
    additionalSettings: string;
  },
  catalog: PublicChannelSettingsCatalog
) {
  const values = parseSettingValues(channel.additionalSettings);
  const verified =
    values.find((setting) => setting?.title === 'Verified')?.value || false;
  const provider = catalog.providers.find(
    (candidate) => candidate.identifier === channel.identifier
  );
  const schema = !provider?.dto
    ? false
    : catalog.schemas[provider.dto.name];

  return {
    id: channel.id,
    name: channel.name,
    identifier: channel.identifier,
    settings: {
      rules: provider ? catalog.rules[provider.identifier] || '' : '',
      maxLength: provider ? provider.maxLength(!!verified) : 0,
      settings: !schema ? 'No additional settings required' : schema,
      tools: provider ? catalog.tools[provider.identifier] || [] : [],
      values,
    },
  };
}

function parseSettingValues(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
