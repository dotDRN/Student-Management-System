import React, { useState, useEffect } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Megaphone, Plus, Bell, Pin, Clock, User } from 'lucide-react';
import api from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { formatDate } from '../utils/date';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';

interface Announcement {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  expiresAt: string | null;
  targetRoles: string[];
}

export const Announcements: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { currentUser } = useAuthStore();
  
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    body: '',
    targetRoles: ['teacher', 'center_admin', 'tech_admin', 'volunteer'],
    isPinned: false
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const res = await api.get('/announcements');
      setAnnouncements(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (formData.id) {
        await api.put(`/announcements/${formData.id}`, {
          title: formData.title,
          body: formData.body,
          targetRoles: formData.targetRoles,
          isPinned: formData.isPinned
        });
      } else {
        await api.post('/announcements', {
          title: formData.title,
          body: formData.body,
          targetRoles: formData.targetRoles,
          isPinned: formData.isPinned,
          centerId: currentUser?.centerIds[0]
        });
      }
      setIsModalOpen(false);
      setFormData({ id: '', title: '', body: '', targetRoles: ['teacher', 'center_admin', 'tech_admin', 'volunteer'], isPinned: false });
      fetchAnnouncements();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setFormData({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      targetRoles: announcement.targetRoles,
      isPinned: announcement.isPinned
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this announcement?")) return;
    try {
      await api.delete(`/announcements/${id}`);
      fetchAnnouncements();
    } catch (err) {
      console.error(err);
    }
  };

    const isManagement = ['super_admin', 'center_admin', 'tech_admin'].includes(currentUser?.role || '');

    if (loading) return <PageWrapper title="Announcements"><LoadingSpinner /></PageWrapper>;

    return (
      <PageWrapper title="Announcements">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
              <Megaphone className="text-primary" />
              System Announcements
            </h1>
            <p className="text-neutral-500">Stay updated with the latest news and notifications</p>
          </div>
          {isManagement && (
            <Button variant="primary" className="flex items-center gap-2" onClick={() => {
              setFormData({ id: '', title: '', body: '', targetRoles: ['teacher', 'center_admin', 'tech_admin', 'volunteer'], isPinned: false });
              setIsModalOpen(true);
            }}>
              <Plus size={18} />
              Post New Announcement
            </Button>
          )}
        </div>

      <div className="space-y-4">
        {announcements.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400 mx-auto mb-4">
               <Bell size={32} />
            </div>
            <h3 className="text-lg font-medium text-neutral-900">No active announcements</h3>
            <p className="text-neutral-500 mt-1">Check back later for system updates or news.</p>
          </Card>
        ) : (
          announcements.map(a => (
            <Card key={a.id} className={`p-6 transition-all hover:shadow-md ${a.isPinned ? 'border-l-4 border-l-primary' : ''}`}>
               <div className="flex justify-between items-start mb-4">
                  <div className="flex items-start gap-3">
                     {a.isPinned && <Pin size={16} className="text-primary mt-1" />}
                     <div>
                        <h2 className="text-lg font-bold text-neutral-900">{a.title}</h2>
                        <div className="flex items-center gap-4 mt-1">
                           <span className="text-xs text-neutral-400 flex items-center gap-1">
                              <Clock size={12} />
                              {formatDate(new Date(a.createdAt), 'MMM d, yyyy • h:mm a')}
                           </span>
                           <span className="text-xs text-neutral-400 flex items-center gap-1">
                              <User size={12} />
                              Visible to: {a.targetRoles.join(', ')}
                           </span>
                        </div>
                     </div>
                  </div>
                  {isManagement && (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-brand-600 px-2" onClick={() => handleEdit(a)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="text-neutral-500 hover:text-red-600 px-2" onClick={() => handleDelete(a.id)}>Delete</Button>
                    </div>
                  )}
               </div>
               <div className="text-neutral-700 whitespace-pre-wrap leading-relaxed">
                  {a.body}
               </div>
            </Card>
          ))
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={formData.id ? "Edit Announcement" : "Post Announcement"}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Title</label>
            <Input
              required
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="E.g., Holiday Notice, New Policy..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Content</label>
            <textarea
              required
              rows={5}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={formData.body}
              onChange={e => setFormData({ ...formData, body: e.target.value })}
              placeholder="Enter announcement details..."
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPinned"
              checked={formData.isPinned}
              onChange={e => setFormData({ ...formData, isPinned: e.target.checked })}
              className="rounded text-primary focus:ring-primary"
            />
            <label htmlFor="isPinned" className="text-sm text-neutral-700">Pin to top</label>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">{formData.id ? "Save Changes" : "Post Announcement"}</Button>
          </div>
        </form>
      </Modal>
    </PageWrapper>
  );
};
