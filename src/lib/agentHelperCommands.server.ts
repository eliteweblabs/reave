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
  return AGENT_HELPER_COMMANDS.filter(isHelperCommandEnabled).map((cmd) => {
    if (cmd.slash === '/document' && hasFeature('digital_signature')) {
      return {
        ...cmd,
        summary: 'Send a document signing link',
        template: 'Send document [template] to [client] for signing.',
        example: 'Send document service-agreement to Acme Corp for signing.',
      };
    }
    return cmd;
  });
}

export function enabledFeatureIds(): FeatureId[] {
  return [...enabledFeatures()];
}
