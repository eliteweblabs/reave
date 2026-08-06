  const skipDeploys = opts.skip_deploys === true;
  const updated: string[] = [];

  for (const [name, value] of entries) {
    const result = await railwayGraphql<{ variableUpsert?: boolean | null }>({
      query: `mutation upsert($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }`,
      variables: {
        input: {
          projectId: project.id,
          environmentId: environment.id,
          serviceId: service?.id ?? null,
          name,
          value: String(value),
        },
      },
    });
    if (!result.ok) return { ok: false, error: gqlError(result) };