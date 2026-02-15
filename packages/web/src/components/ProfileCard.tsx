import type { Profile } from '@saban/shared';
import { Badge } from '@/components/ui/badge';
import { User, MapPin } from 'lucide-react';

interface ProfileCardProps {
  profile: Profile;
  onClick?: () => void;
}

const statusColors: Record<Profile['status'], string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  replied: 'bg-green-100 text-green-800',
  qualified: 'bg-emerald-100 text-emerald-800',
  disqualified: 'bg-gray-100 text-gray-800',
};

export function ProfileCard({ profile, onClick }: ProfileCardProps) {
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unknown';
  const profileImage = profile.profile_picture_url || profile.profile_picture_payload;

  return (
    <div
      className="flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
        {profileImage ? (
          <img
            src={profileImage}
            alt={fullName}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <User className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium truncate">{fullName}</h3>
          {profile.connection_degree && (
            <span className="text-xs text-muted-foreground shrink-0">
              {profile.connection_degree}
            </span>
          )}
          <Badge className={statusColors[profile.status || 'new']} variant="secondary">
            {profile.status || 'new'}
          </Badge>
        </div>
        {profile.headline && (
          <p className="text-sm text-muted-foreground truncate">{profile.headline}</p>
        )}
        {profile.location && (
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {profile.location}
          </p>
        )}
      </div>

      <div className="flex gap-1 shrink-0">
        {profile.tags?.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs">
            {tag}
          </Badge>
        ))}
        {(profile.tags?.length || 0) > 3 && (
          <Badge variant="outline" className="text-xs">
            +{(profile.tags?.length || 0) - 3}
          </Badge>
        )}
      </div>
    </div>
  );
}
