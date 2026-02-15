import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getExportUrl } from '@/lib/api';
import type { ProfilesQuery } from '@saban/shared';

interface ExportButtonProps {
  query: Omit<ProfilesQuery, 'page' | 'limit'>;
}

export function ExportButton({ query }: ExportButtonProps) {
  const handleExport = () => {
    window.open(getExportUrl(query), '_blank');
  };

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  );
}
