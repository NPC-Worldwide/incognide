import { AgentPromptCard as SharedAgentPromptCard, type AgentPromptData } from 'npcts';
import { resolvePrompt } from '../studioActions/uiActions';

export { type AgentPromptData };

export function AgentPromptCard({ promptData }: { promptData: AgentPromptData }) {
  return (
    <SharedAgentPromptCard
      promptData={promptData}
      onResolve={(response) => resolvePrompt(promptData.id, response)}
    />
  );
}

export default AgentPromptCard;
