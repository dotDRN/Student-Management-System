import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { EmptyState } from '../../components/ui/EmptyState';
import { getFormTemplate, listFormSubmissions, syncKoboSubmissions } from '../../services/forms.service';
import { ArrowLeft } from 'lucide-react';

export const FormSubmissionsPage: React.FC = () => {
  const { templateId } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [externalId, setExternalId] = useState<string | undefined>();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (p = page) => {
    if (!templateId) return;
    setLoading(true);
    setError(null);
    try {
      const [tpl, res] = (await Promise.all([
        getFormTemplate(templateId),
        listFormSubmissions({
          templateId,
          page: String(p),
          limit: '25',
        }),
      ])) as [any, any];
      setTitle(tpl.name);
      setExternalId(tpl.externalId);
      setRows(res.submissions);
      setTotal(res.total);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch {
      setError('Failed to load submissions.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!templateId || !externalId) return;
    try {
      await syncKoboSubmissions(templateId, externalId);
      await load(1);
    } catch {
      setError('Failed to sync Kobo submissions.');
    }
  };

  useEffect(() => {
    if (!templateId) {
      setLoading(false);
      return;
    }
    void load(1);
  }, [templateId]);

  if (!templateId) return null;

  return (
    <PageWrapper
      title={title ? `Submissions · ${title}` : 'Submissions'}
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleSync}>
            Sync Kobo
          </Button>
          <Button variant="ghost" onClick={() => navigate('/forms')} className="bg-white">
            <ArrowLeft size={18} className="mr-2" /> Forms
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} />
        </div>
      )}

      <Card>
        {loading ? (
          <LoadingSpinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No submissions yet" description="Responses will appear here after users submit this form." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Student</th>
                    <th className="py-2 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const st = row.student as { fullName?: string } | undefined;
                    const created = row.createdAt as string | undefined;

                    return (
                      <tr key={String(row.id)} className="border-b border-neutral-100 align-top">
                        <td className="py-2 pr-3 text-neutral-600 whitespace-nowrap">
                          {created ? new Date(created).toLocaleString() : '—'}
                        </td>
                        <td className="py-2 pr-3">
                          {st?.fullName ?? String(row.studentId ?? '')}
                        </td>
                        <td className="py-2">
                          <div className="text-xs bg-neutral-50 p-2 rounded-lg max-h-40 overflow-auto border border-neutral-100">
                            {Object.entries((row.data as Record<string, unknown>) || {}).map(([k, v]) => (
                              <div key={k}>
                                <strong>{k}:</strong> {String(v)}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex justify-center gap-2 items-center text-sm text-neutral-600">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => void load(page - 1)}>
                  Previous
                </Button>
                <span>
                  Page {page} of {totalPages} ({total} total)
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => void load(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </PageWrapper>
  );
};