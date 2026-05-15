import React, { useState, useEffect } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Calendar, Plus, Clock, MapPin, CheckCircle2, Circle, Trash2 } from 'lucide-react';
import api from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { formatDate } from '../utils/date';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { listCenters, listPrograms } from '../services/centers.service';

interface Activity {
  id: string;
  name: string;
  description: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  startDate: string;
  endDate: string;
  volunteers: string[];
  center: { id: string; name: string };
  program: { id: string; name: string };
}

export const Activities: React.FC = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [centers, setCenters] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const { currentUser } = useAuthStore();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: formatDate(new Date(), 'yyyy-MM-dd'),
    endDate: formatDate(new Date(), 'yyyy-MM-dd'),
    status: 'planned',
    centerIds: [] as string[],
    programId: '',
    volunteers: ''
  });

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const res = await api.get('/activities');
      setActivities(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMeta = async () => {
    try {
      const [c, p] = await Promise.all([listCenters(), listPrograms()]);
      setCenters(c);
      setPrograms(p);
      if (p.length > 0) {
        setFormData(prev => ({ ...prev, programId: p[0].id }));
      }
    } catch (err) {
      console.error('Failed to fetch metadata:', err);
    }
  };

  useEffect(() => {
    void fetchActivities();
    void fetchMeta();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const payload = {
        ...formData,
        volunteers: formData.volunteers.split(',').map(v => v.trim()).filter(Boolean)
      };

      if (editingActivity) {
        await api.put(`/activities/${editingActivity.id}`, payload);
      } else {
        await api.post('/activities', payload);
      }

      setIsModalOpen(false);
      setEditingActivity(null);
      setFormData({
        name: '',
        description: '',
        startDate: formatDate(new Date(), 'yyyy-MM-dd'),
        endDate: formatDate(new Date(), 'yyyy-MM-dd'),
        status: 'planned',
        centerIds: [],
        programId: programs[0]?.id || '',
        volunteers: ''
      });
      await fetchActivities();
    } catch (err: any) {
      console.error('Failed to save activity:', err);
      alert(err?.response?.data?.message || 'Failed to save activity. Please ensure all fields are correct.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this activity?")) return;
    try {
      setLoading(true);
      await api.delete(`/activities/${id}`);
      await fetchActivities();
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to delete activity.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'in_progress': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'completed': return 'bg-green-50 text-green-700 border-green-200';
      case 'cancelled': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-neutral-50 text-neutral-700 border-neutral-200';
    }
  };

  const isAdmin = ['super_admin', 'center_admin', 'tech_admin'].includes(currentUser?.role || '');

  if (loading) return <PageWrapper title="Activities"><LoadingSpinner /></PageWrapper>;

  return (
    <PageWrapper title="Activities & Events">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Calendar className="text-primary" />
            Program Activities
          </h1>
          <p className="text-neutral-500">Plan and track developmental activities across centers</p>
        </div>
        {isAdmin && (
          <Button variant="primary" className="flex items-center gap-2" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} />
            Plan New Activity
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
         <Card className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
               <Calendar size={20} />
            </div>
            <div>
               <p className="text-xs text-neutral-500 font-medium">Total Activities</p>
               <p className="text-xl font-bold text-neutral-900">{activities.length}</p>
            </div>
         </Card>
         <Card className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
               <Clock size={20} />
            </div>
            <div>
               <p className="text-xs text-neutral-500 font-medium">In Progress</p>
               <p className="text-xl font-bold text-neutral-900">{activities.filter(a => a.status === 'in_progress').length}</p>
            </div>
         </Card>
         <Card className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
               <CheckCircle2 size={20} />
            </div>
            <div>
               <p className="text-xs text-neutral-500 font-medium">Completed</p>
               <p className="text-xl font-bold text-neutral-900">{activities.filter(a => a.status === 'completed').length}</p>
            </div>
         </Card>
         <Card className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-neutral-50 text-neutral-600 flex items-center justify-center">
               <Circle size={20} />
            </div>
            <div>
               <p className="text-xs text-neutral-500 font-medium">Planned</p>
               <p className="text-xl font-bold text-neutral-900">{activities.filter(a => a.status === 'planned').length}</p>
            </div>
         </Card>
      </div>

      <div className="space-y-4">
        {activities.length === 0 ? (
          <Card className="p-12 text-center flex flex-col items-center justify-center bg-neutral-50/30 border-dashed">
            <Calendar size={48} className="text-neutral-300 mb-4" />
            <h2 className="text-xl font-bold text-neutral-900 mb-2">No activities found</h2>
            <p className="text-neutral-500 max-w-sm">Scheduled workshops and events will appear here.</p>
          </Card>
        ) : (
          activities.map(activity => (
            <Card key={activity.id} className="p-6 hover:shadow-md transition-all group">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(activity.status)}`}>
                      {activity.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-medium text-primary bg-primary/5 px-2 py-0.5 rounded-full">
                      {activity.program?.name}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 group-hover:text-primary transition-colors">{activity.name}</h3>
                  <p className="text-neutral-600 mt-2 line-clamp-2 text-sm">{activity.description}</p>
                  
                  <div className="flex flex-wrap items-center gap-6 mt-4">
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <Clock size={14} className="text-neutral-400" />
                      {formatDate(new Date(activity.startDate), 'MMM d, yyyy')} - {formatDate(new Date(activity.endDate), 'MMM d, yyyy')}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <MapPin size={14} className="text-neutral-400" />
                      {activity.center?.name}
                    </div>
                  </div>
                </div>
                
                <div className="flex md:flex-col justify-center gap-2 min-w-[160px]">
                  {isAdmin && (
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="ghost"
                        className="text-xs w-full border border-neutral-100"
                        onClick={() => {
                          setEditingActivity(activity);
                          setFormData({
                            name: activity.name,
                            description: activity.description,
                            startDate: activity.startDate.slice(0, 10),
                            endDate: activity.endDate.slice(0, 10),
                            status: activity.status,
                            centerIds: [activity.center?.id],
                            programId: activity.program?.id,
                            volunteers: activity.volunteers?.join(", ") || "",
                          });
                          setIsModalOpen(true);
                        }}
                      >
                        Edit Details
                      </Button>
                      <Button variant="ghost" className="text-xs text-danger border border-danger/20 hover:bg-danger/10 w-full" onClick={() => handleDeleteActivity(activity.id)}>
                        <Trash2 size={16} className="mr-2" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingActivity(null);
        }}
        title={editingActivity ? "Edit Activity" : "Plan New Activity"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
             <label className="block text-sm font-medium text-neutral-700 mb-1">Activity Name</label>
             <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="E.g. Summer Camp, Drawing Competition" />
          </div>
          <div>
             <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
             <textarea className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" rows={3} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Details about the activity..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Start Date</label>
                <Input type="date" required value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
             </div>
             <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">End Date</label>
                <Input type="date" required value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
             </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
             <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Centers</label>
                <div className="flex flex-wrap gap-2 p-3 border border-neutral-300 rounded-lg bg-white">
                  {centers.map(c => (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-1 bg-neutral-50 rounded-full border border-neutral-200 cursor-pointer hover:bg-neutral-100">
                      <input 
                        type="checkbox" 
                        checked={formData.centerIds.includes(c.id)} 
                        onChange={e => {
                          if (e.target.checked) {
                            setFormData(prev => ({ ...prev, centerIds: [...prev.centerIds, c.id] }));
                          } else {
                            setFormData(prev => ({ ...prev, centerIds: prev.centerIds.filter(id => id !== c.id) }));
                          }
                        }}
                      />
                      <span className="text-xs font-medium">{c.name}</span>
                    </label>
                  ))}
                </div>
             </div>
             <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Program</label>
                <select className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" value={formData.programId} onChange={e => setFormData({ ...formData, programId: e.target.value })} required>
                   {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
             </div>
          </div>
          <div>
             <label className="block text-sm font-medium text-neutral-700 mb-1">Volunteers (Comma separated)</label>
             <Input value={formData.volunteers} onChange={e => setFormData({ ...formData, volunteers: e.target.value })} placeholder="E.g. John Doe, Sarah Smith" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
             <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
             <Button type="submit" variant="primary">
               {editingActivity ? "Save Changes" : "Create Activity"}
             </Button>
          </div>
        </form>
      </Modal>
    </PageWrapper>
  );
};
