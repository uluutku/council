import { useMemo, useState } from 'react';

export function useConversationDialogs(messages) {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewerAttachment, setViewerAttachment] = useState(null);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);

  const activeViewerAttachment = useMemo(() => {
    if (!viewerAttachment) return null;
    const stillVisible = messages.some((message) =>
      (message.attachments ?? []).some((attachment) => attachment.id === viewerAttachment.id),
    );
    return stillVisible ? viewerAttachment : null;
  }, [messages, viewerAttachment]);

  return {
    deleteTarget,
    setDeleteTarget,
    viewerAttachment: activeViewerAttachment,
    setViewerAttachment,
    forwardDialogOpen,
    setForwardDialogOpen,
  };
}
