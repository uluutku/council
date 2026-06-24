import { Navigate, useParams } from 'react-router-dom';

export function LegacyAiConversationRedirect() {
  const { conversationId } = useParams();
  return <Navigate to={`/app/messages/ai/${conversationId}`} replace />;
}
