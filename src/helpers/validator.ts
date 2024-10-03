import { TransformDecodeCheckError, TransformDecodeError, Value, ValueError } from "@sinclair/typebox/value";
import {
  IncentivesConfiguration,
  incentivesConfigurationSchema,
  validateIncentivesConfiguration,
} from "../configuration/incentives";
import envConfigSchema, { EnvConfigType, envValidator } from "../types/env-type";
import * as github from "@actions/github";
import { Octokit } from "@octokit/rest";

export function validateAndDecodeSchemas(rawEnv: object, rawSettings: object) {
  const errors: ValueError[] = [];

  const env = Value.Default(envConfigSchema, rawEnv) as EnvConfigType;
  if (!envValidator.test(env)) {
    for (const error of envValidator.errors(env)) {
      console.error(error);
      errors.push(error);
    }
  }

  const settings = Value.Default(incentivesConfigurationSchema, rawSettings) as IncentivesConfiguration;
  if (!validateIncentivesConfiguration.test(settings)) {
    for (const error of validateIncentivesConfiguration.errors(settings)) {
      console.error(error);
      errors.push(error);
    }
  }

  if (errors.length) {
    throw { errors };
  }

  try {
    const decodedSettings = Value.Decode(incentivesConfigurationSchema, settings);
    const decodedEnv = Value.Decode(envConfigSchema, rawEnv || {});
    return { decodedEnv, decodedSettings };
  } catch (e) {
    console.error("validateAndDecodeSchemas", e);
    if (e instanceof TransformDecodeCheckError || e instanceof TransformDecodeError) {
      throw { errors: [e.error] };
    }
    throw e;
  }
}

export async function returnDataToKernel(
  repoToken: string,
  stateId: string,
  output: object,
  eventType = "return_data_to_ubiquibot_kernel"
) {
  const octokit = new Octokit({ auth: repoToken });
  return octokit.repos.createDispatchEvent({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    event_type: eventType,
    client_payload: {
      state_id: stateId,
      output: JSON.stringify(output),
    },
  });
}