import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuthStore } from '../../store/useAuthStore';
import { listFormTemplates, syncKoboForms, syncKoboSubmissions, type FormTemplateListItem } from '../../services/forms.service';
import { Inbox, RefreshCw, ExternalLink } from 'lucide-react';

export const FormsListPage: React.FC = () => {
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => ['super_admin', 'center_admin', 'tech_admin'].includes(s.currentUser?.role || ''));

  const [templates, setTemplates] = useState<FormTemplateListItem[]>([]);
  const [formTypeSlugs, setFormTypeSlugs] = useState<string[]>([]);
  const [formTypeFilter, setFormTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncingTemplateId, setSyncingTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listFormTemplates(formTypeFilter || undefined, isAdmin);
      setTemplates(rows);
    } catch {
      setError('Failed to load form templates.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncKobo = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      const result = await syncKoboForms();
      setSuccess(result.message);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to sync Kobo forms.');
      setLoading(false);
    }
  };

  const handleSyncData = async (templateId: string, externalId: string) => {
    try {
      setSyncingTemplateId(templateId);
      setError(null);
      setSuccess(null);
      const result = await syncKoboSubmissions(templateId, externalId);
      setSuccess(result.message);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to sync submissions.');
    } finally {
      setSyncingTemplateId(null);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await listFormTemplates(undefined, isAdmin);
        if (!alive) return;
        const slugs = [...new Set(all.map((t) => t.formType).filter(Boolean))] as string[];
        setFormTypeSlugs(slugs.sort());
      } catch {
        if (alive) setFormTypeSlugs([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [isAdmin, formTypeFilter]);

  return (
    <PageWrapper
      title="Forms"
      actions={
        isAdmin ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => window.open(import.meta.env.VITE_KOBO_URL || 'https://kf.kobotoolbox.org', '_blank')}>
              <ExternalLink size={16} className="mr-2" /> KoboToolbox Admin
            </Button>
            <Button variant="primary" onClick={handleSyncKobo} isLoading={loading}>
              <RefreshCw size={16} className="mr-2" /> Sync Forms from Kobo
            </Button>
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm flex items-center">
          <span className="font-semibold mr-2">Success:</span> {success}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-neutral-600 flex items-center gap-2">
          <span className="font-medium">Form type</span>
          <select
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
            value={formTypeFilter}
            onChange={(e) => setFormTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            {formTypeSlugs.map((ft) => (
              <option key={ft} value={ft}>
                {ft}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card>
        {loading && !templates.length ? (
          <LoadingSpinner />
        ) : templates.length === 0 ? (
          <EmptyState
            title="No form templates synced"
            description={isAdmin ? 'Click "Sync Forms from Kobo" to pull your surveys.' : 'Ask an admin to sync form templates.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-3 pr-4 font-medium">Name</th>
                  <th className="py-3 pr-4 font-medium">Type</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Created</th>
                  <th className="py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b border-neutral-100 hover:bg-neutral-50/80">
                    <td className="py-3 pr-4 font-medium text-neutral-900">
                      {t.name}
                      {t.externalSource === 'kobo' && (
                        <span className="ml-2 text-[10px] font-bold bg-[#145a85] text-white px-2 py-0.5 rounded-full uppercase tracking-wider">Kobo</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-neutral-600">{t.formType}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={t.isActive ? 'success' : 'neutral'}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-neutral-500">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/forms/${t.id}/submissions`)}>
                        <Inbox size={16} className="mr-1" /> View Submissions
                      </Button>
                      {isAdmin && t.externalSource === 'kobo' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleSyncData(t.id, (t as any).externalId)}
                          isLoading={syncingTemplateId === t.id}
                        >
                          <RefreshCw size={16} className="mr-1" /> Pull Data
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageWrapper>
  );
};