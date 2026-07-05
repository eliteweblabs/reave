/**
 * Client-side chat message sync — fetches and saves messages across devices
 */

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
}

/**
 * Fetch all messages for a chat from the server
 */
export async function fetchChatMessages(chatId: string): Promise<ChatMessage[]> {
  try {
    const response = await fetch(`/api/chats/${chatId}/messages`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { messages } = await response.json();
    return messages.map((m: any) => ({
      ...m,
      createdAt: new Date(m.createdAt),
    }));
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return [];
  }
}

/**
 * Fetch messages created/updated after a specific timestamp (for polling)
 */
export async function fetchNewMessages(
  chatId: string,
  since: Date
): Promise<ChatMessage[]> {
  try {
    const response = await fetch(
      `/api/chats/${chatId}/messages?since=${since.toISOString()}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { messages } = await response.json();
    return messages.map((m: any) => ({
      ...m,
      createdAt: new Date(m.createdAt),
    }));
  } catch (error) {
    console.error('Failed to fetch new messages:', error);
    return [];
  }
}

/**
 * Save a message to the server
 */
export async function saveMessage(
  chatId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ChatMessage | null> {
  try {
    const response = await fetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { message } = await response.json();
    return {
      ...message,
      createdAt: new Date(message.createdAt),
    };
  } catch (error) {
    console.error('Failed to save message:', error);
    return null;
  }
}

/**
 * Start polling for new messages on an interval
 * Returns a stop function to cancel polling
 */
export function startPolling(
  chatId: string,
  onNewMessages: (messages: ChatMessage[]) => void,
  interval: number = 3000 // 3 seconds
): () => void {
  let lastCheck = new Date();

  const pollInterval = setInterval(async () => {
    const newMessages = await fetchNewMessages(chatId, lastCheck);
    if (newMessages.length > 0) {
      lastCheck = new Date();
      onNewMessages(newMessages);
    }
  }, interval);

  return () => clearInterval(pollInterval);
}
