import {
  AGENT_HELPER_COMMANDS,
  type AgentHelperCommand,
} from './agentHelperCommands';
import { enabledFeatures, hasFeature, type FeatureId } from './features';

export function isHelperCommandEnabled(cmd: AgentHelperCommand): boolean {
  const feature = cmd.feature ?? 'core';
  if (feature === 'core') return true;
  return hasFeature(feature as FeatureId);
}

export function listEnabledHelperCommands(): AgentHelperCommand[] {
  return AGENT_HELPER_COMMANDS.filter(isHelperCommandEnabled);
}

export function enabledFeatureIds(): FeatureId[] {
  return [...enabledFeatures()];
}
