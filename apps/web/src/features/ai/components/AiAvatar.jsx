import { Bot } from 'lucide-react';
import { useSignedAvatarUrl } from '../../../hooks/useSignedAvatarUrl.js';
import { PERSONA_AVATAR_BUCKET } from '../../../lib/avatarStorage.js';

export function AiAvatar({ name, kind, avatarKey, className = 'msg-avatar', size, iconSize = 20 }) {
  const personaAvatarUrl = useSignedAvatarUrl(
    PERSONA_AVATAR_BUCKET,
    kind === 'custom' ? avatarKey : null,
  );
  const imageUrl = kind === 'custom' ? personaAvatarUrl : avatarKey;
  const fallback = name?.slice(0, 1) || <Bot size={iconSize} strokeWidth={2} />;

  return (
    <span
      className={className}
      data-kind={kind === 'custom' ? 'custom' : 'ai'}
      data-size={size}
      aria-hidden="true"
    >
      {imageUrl ? <img src={imageUrl} alt="" /> : fallback}
    </span>
  );
}
