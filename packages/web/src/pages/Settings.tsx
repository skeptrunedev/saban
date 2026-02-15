import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAuthData,
  useOrganizationMembers,
  useInviteMember,
  useRemoveMember,
} from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Trash2, ArrowLeft } from 'lucide-react';

export function Settings() {
  const navigate = useNavigate();
  const { data: authData } = useAuthData();
  const currentOrg = authData?.currentOrganization;
  const currentUser = authData?.user;

  const { data: members = [], isLoading: membersLoading } = useOrganizationMembers(currentOrg?.id);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const inviteMember = useInviteMember();
  const removeMember = useRemoveMember();

  const isCurrentUserAdmin = members.some(
    (m) => m.userId === currentUser?.id && m.role === 'admin'
  );

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    if (!email.trim() || !currentOrg) return;

    try {
      await inviteMember.mutateAsync({
        orgId: currentOrg.id,
        email: email.trim(),
        role,
      });
      setInviteSuccess(`Invitation sent to ${email}`);
      setEmail('');
    } catch (err) {
      setInviteError((err as Error).message);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!currentOrg) return;

    const isSelf = userId === currentUser?.id;
    const confirmMessage = isSelf
      ? 'Are you sure you want to leave this organization?'
      : 'Are you sure you want to remove this member?';

    if (!confirm(confirmMessage)) return;

    try {
      await removeMember.mutateAsync({ orgId: currentOrg.id, userId });
      if (isSelf) {
        navigate('/organizations/select');
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  if (!currentOrg) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground">No organization selected.</p>
        <Button onClick={() => navigate('/organizations/select')}>Select Organization</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Organization Settings</h1>
          <p className="text-muted-foreground">{currentOrg.name}</p>
        </div>
      </div>

      {/* Invite Member */}
      {isCurrentUserAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invite Team Member</CardTitle>
            <CardDescription>
              Send an invitation to add someone to this organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                />
              </div>
              <div className="w-32 space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as 'member' | 'admin')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviteMember.isPending || !email.trim()}>
                <UserPlus className="mr-2 h-4 w-4" />
                {inviteMember.isPending ? 'Sending...' : 'Invite'}
              </Button>
            </form>

            {inviteError && <p className="mt-3 text-sm text-destructive">{inviteError}</p>}
            {inviteSuccess && <p className="mt-3 text-sm text-green-600">{inviteSuccess}</p>}
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members</CardTitle>
          <CardDescription>People who have access to this organization</CardDescription>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <p className="text-muted-foreground">Loading members...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  {isCurrentUserAdmin && <TableHead className="w-16"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      {member.user?.firstName} {member.user?.lastName}
                      {member.userId === currentUser?.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </TableCell>
                    <TableCell>{member.user?.email}</TableCell>
                    <TableCell>
                      <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                        {member.role}
                      </Badge>
                    </TableCell>
                    {isCurrentUserAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(member.userId)}
                          disabled={removeMember.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
