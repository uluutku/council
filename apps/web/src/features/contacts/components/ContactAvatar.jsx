import { contactInitials } from '../utils/contactDisplay.js';
import { PROFILE_AVATAR_BUCKET } from '../../../lib/avatarStorage.js';
import { useSignedAvatarUrl } from '../../../hooks/useSignedAvatarUrl.js';

export function ContactAvatar({ user }) {
  const url = useSignedAvatarUrl(PROFILE_AVATAR_BUCKET, user.avatar_path);

  return (
    <span className="contact-avatar" aria-hidden="true">
      {url ? <img src={url} alt="" /> : contactInitials(user)}
    </span>
  );
}
