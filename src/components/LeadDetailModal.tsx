'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Lead {
    id: string;
    email: string;
    phone: string;
    full_name: string;
    status: string;
    quality_status?: string;
    quality_feedback_sent: boolean;
    capi_sent_stages?: string[];
    created_at: string;
    notes: string | null;
    assigned_to: string | null;
    assigned_name?: string;
    form_name: string | null;
    raw_data?: Record<string, unknown>;
}

interface TeamMember {
    id: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    name?: string;
    email: string;
}

interface Activity {
    id: string;
    activity_type: string;
    title: string;
    description: string | null;
    activity_date: string;
    created_at: string;
    created_by_type: string;
}

interface LeadDetailModalProps {
    lead: Lead;
    teamMembers: TeamMember[];
    onClose: () => void;
    onUpdate: () => void;
}

const STATUS_OPTIONS = [
    { id: 'new', label: 'Neu', color: '#F59E0B', bg: '#FEF3C7' },
    { id: 'contacted', label: 'Kontaktiert', color: '#3B82F6', bg: '#DBEAFE' },
    { id: 'interested', label: 'Interessiert', color: '#8B5CF6', bg: '#EDE9FE' },
    { id: 'meeting', label: 'Termin', color: '#6366F1', bg: '#E0E7FF' },
    { id: 'won', label: 'Gewonnen', color: '#10B981', bg: '#D1FAE5' },
    { id: 'lost', label: 'Verloren', color: '#EF4444', bg: '#FEE2E2' },
];

const CAPI_STAGES = [
    { id: 'interested', label: 'Interessiert', isPositive: true },
    { id: 'meeting', label: 'Termin', isPositive: true },
    { id: 'won', label: 'Gewonnen', isPositive: true },
    { id: 'lost', label: 'Verloren', isPositive: false },
];

const ACTIVITY_TYPES = [
    { id: 'call', label: 'Anruf', icon: 'phone' },
    { id: 'email', label: 'E-Mail', icon: 'email' },
    { id: 'meeting', label: 'Meeting', icon: 'calendar' },
    { id: 'note', label: 'Notiz', icon: 'note' },
];

function getActivityIcon(type: string) {
    switch (type) {
        case 'call':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
            );
        case 'email':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
            );
        case 'meeting':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            );
        case 'note':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
            );
        case 'status_change':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
            );
        default:
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
    }
}

function getActivityColor(type: string) {
    switch (type) {
        case 'call': return { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500' };
        case 'email': return { text: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-500' };
        case 'meeting': return { text: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', dot: 'bg-indigo-500' };
        case 'note': return { text: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400' };
        case 'status_change': return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' };
        default: return { text: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400' };
    }
}

export default function LeadDetailModal({
    lead,
    teamMembers,
    onClose,
    onUpdate
}: LeadDetailModalProps) {
    const [activeTab, setActiveTab] = useState<'details' | 'activities'>('details');
    const [notes, setNotes] = useState(lead.notes || '');
    const [status, setStatus] = useState(lead.status);
    const [assignedTo, setAssignedTo] = useState(lead.assigned_to || '');
    const [saving, setSaving] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [sendingStage, setSendingStage] = useState<string | null>(null);
    const [sentStages, setSentStages] = useState<string[]>(lead.capi_sent_stages || []);

    // Activities state
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
    const [showAddActivity, setShowAddActivity] = useState(false);
    const [newActivity, setNewActivity] = useState({
        type: 'call',
        title: '',
        description: '',
        date: new Date().toISOString().slice(0, 16),
    });
    const [savingActivity, setSavingActivity] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const getMemberName = (member: TeamMember) => {
        if (member.full_name) return member.full_name;
        if (member.first_name) return `${member.first_name} ${member.last_name || ''}`.trim();
        return member.name || member.email;
    };

    const currentStatus = STATUS_OPTIONS.find(s => s.id === status) || STATUS_OPTIONS[0];

    // Fetch activities when tab switches
    useEffect(() => {
        if (activeTab === 'activities' && activities.length === 0) {
            fetchActivities();
        }
    }, [activeTab]);

    const fetchActivities = async () => {
        setLoadingActivities(true);
        try {
            const res = await fetch(`/api/leads/${lead.id}/activities`);
            const data = await res.json();
            setActivities(data.activities || []);
        } catch (error) {
            console.error('Error fetching activities:', error);
        }
        setLoadingActivities(false);
    };

    const handleAddActivity = async () => {
        if (!newActivity.title.trim()) return;
        setSavingActivity(true);
        try {
            const res = await fetch(`/api/leads/${lead.id}/activities`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    activityType: newActivity.type,
                    title: newActivity.title,
                    description: newActivity.description || null,
                    activityDate: newActivity.date ? new Date(newActivity.date).toISOString() : null,
                }),
            });
            if (res.ok) {
                setNewActivity({ type: 'call', title: '', description: '', date: new Date().toISOString().slice(0, 16) });
                setShowAddActivity(false);
                await fetchActivities();
            }
        } catch (error) {
            console.error('Error adding activity:', error);
        }
        setSavingActivity(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch(`/api/leads/${lead.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes, status }),
            });
            onUpdate();
        } catch (error) {
            console.error('Error saving:', error);
        }
        setSaving(false);
    };

    const handleAssign = async () => {
        if (!assignedTo) return;
        setAssigning(true);
        try {
            const res = await fetch('/api/leads/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadId: lead.id, teamMemberId: assignedTo }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                onUpdate();
            }
        } catch (error) {
            console.error('Error assigning:', error);
        }
        setAssigning(false);
    };

    const handleSendStageSignal = async (stage: string) => {
        setSendingStage(stage);
        try {
            const res = await fetch('/api/capi/send-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadId: lead.id, stage }),
            });
            const data = await res.json();
            if (data.success) {
                setSentStages(data.sent_stages || [...sentStages, stage]);
            }
        } catch (error) {
            console.error('Error sending signal:', error);
        }
        setSendingStage(null);
    };

    const handleDelete = async () => {
        if (!confirm('Lead wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
            if (res.ok) {
                onUpdate();
            } else {
                alert('Fehler beim Löschen');
            }
        } catch (error) {
            console.error('Error deleting lead:', error);
            alert('Fehler beim Löschen');
        }
        setDeleting(false);
    };

    // Parse raw_data for extra form fields
    let formData: Record<string, unknown> = {};
    if (lead.raw_data) {
        if (typeof lead.raw_data === 'string') {
            try { formData = JSON.parse(lead.raw_data as string); } catch { formData = {}; }
        } else {
            formData = lead.raw_data;
        }
    }
    const STANDARD_FIELDS = ['full_name', 'first_name', 'last_name', 'email', 'phone', 'phone_number',
        'name', 'Name', 'Email', 'E-Mail', 'E-Mail-Adresse', 'e-mail', 'e-mail-adresse',
        'Telefonnummer', 'telefonnummer', 'Telefon', 'Handy', 'Handynummer',
        'Vollständiger Name', 'vollständiger name', 'Vorname', 'Nachname'];
    const extraFields = Object.entries(formData)
        .filter(([key]) => !STANDARD_FIELDS.includes(key))
        .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');

    const formatDateTime = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const formatActivityDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Gerade eben';
        if (diffMins < 60) return `vor ${diffMins} Min.`;
        if (diffHours < 24) return `vor ${diffHours} Std.`;
        if (diffDays < 7) return `vor ${diffDays} Tagen`;
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="border-b border-gray-100 px-6 py-5">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0052FF] to-[#6366F1] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                {lead.full_name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-lg font-bold text-gray-900">{lead.full_name || 'Unbekannt'}</h2>
                                    <span
                                        className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                        style={{ color: currentStatus.color, backgroundColor: currentStatus.bg }}
                                    >
                                        {currentStatus.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    {lead.form_name && (
                                        <span className="text-xs font-medium text-[#0052FF] bg-[#0052FF]/8 px-2 py-0.5 rounded">
                                            {lead.form_name}
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-400">
                                        Erstellt: {formatDateTime(lead.created_at)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 hover:text-gray-600"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 mt-4 bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                activeTab === 'details'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                Details
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('activities')}
                            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                activeTab === 'activities'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Aktivitaten
                                {activities.length > 0 && (
                                    <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                                        {activities.length}
                                    </span>
                                )}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'details' ? (
                        <div className="p-6 space-y-5">
                            {/* Contact Info */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">E-Mail</span>
                                    </div>
                                    {lead.email ? (
                                        <a href={`mailto:${lead.email}`} className="text-sm font-medium text-[#0052FF] hover:underline break-all">
                                            {lead.email}
                                        </a>
                                    ) : (
                                        <span className="text-sm text-gray-300">-</span>
                                    )}
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        </svg>
                                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Telefon</span>
                                    </div>
                                    {lead.phone ? (
                                        <a href={`tel:${lead.phone}`} className="text-sm font-medium text-[#0052FF] hover:underline">
                                            {lead.phone}
                                        </a>
                                    ) : (
                                        <span className="text-sm text-gray-300">-</span>
                                    )}
                                </div>
                            </div>

                            {/* Extra Form Fields */}
                            {extraFields.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Formular-Antworten</h3>
                                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                                        {extraFields.map(([key, value]) => (
                                            <div key={key} className="flex items-start px-4 py-3">
                                                <span className="text-xs font-medium text-gray-500 w-2/5 pt-0.5 capitalize">{key.replace(/_/g, ' ').replace(/^question\s*(\d+)$/i, 'Frage $1')}</span>
                                                <span className="text-sm text-gray-900 w-3/5">{String(value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Status */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</h3>
                                <div className="flex flex-wrap gap-2">
                                    {STATUS_OPTIONS.map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => setStatus(s.id)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                                            style={{
                                                color: status === s.id ? '#fff' : s.color,
                                                backgroundColor: status === s.id ? s.color : s.bg,
                                                borderColor: status === s.id ? s.color : 'transparent',
                                                boxShadow: status === s.id ? `0 2px 8px ${s.color}40` : 'none',
                                            }}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Team Assignment */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Zuweisung</h3>
                                <div className="flex gap-2">
                                    <select
                                        value={assignedTo}
                                        onChange={(e) => setAssignedTo(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none bg-white"
                                    >
                                        <option value="">Nicht zugewiesen</option>
                                        {teamMembers.map((member) => (
                                            <option key={member.id} value={member.id}>
                                                {getMemberName(member)}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handleAssign}
                                        disabled={!assignedTo || assigning}
                                        className="px-4 py-2 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] disabled:opacity-50 transition-colors"
                                    >
                                        {assigning ? '...' : 'Zuweisen'}
                                    </button>
                                </div>
                                {teamMembers.length === 0 && (
                                    <p className="text-xs text-gray-400 mt-1.5">
                                        <Link href="/dashboard/team" className="text-[#0052FF] hover:underline">
                                            Team-Mitglieder hinzufugen
                                        </Link>
                                    </p>
                                )}
                            </div>

                            {/* Notes */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notizen</h3>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Notizen zum Lead..."
                                    className="w-full p-3 border border-gray-200 rounded-xl resize-none h-24 text-sm focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none transition-all"
                                />
                            </div>

                            {/* Meta Signals */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                    Meta Signale
                                </h3>
                                <p className="text-xs text-gray-400 mb-3">Sende Feedback an Meta fur bessere Lead-Qualitat</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {CAPI_STAGES.map((stage) => {
                                        const isSent = sentStages.includes(stage.id);
                                        const isSending = sendingStage === stage.id;
                                        return (
                                            <button
                                                key={stage.id}
                                                onClick={() => !isSent && handleSendStageSignal(stage.id)}
                                                disabled={isSent || isSending}
                                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border ${
                                                    isSent
                                                        ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-default'
                                                        : stage.isPositive
                                                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                                            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                                }`}
                                            >
                                                {isSent ? (
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                )}
                                                {isSending ? 'Sendet...' : isSent ? `${stage.label} gesendet` : stage.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Activities Tab */
                        <div className="p-6">
                            {/* Add Activity Button */}
                            {!showAddActivity ? (
                                <button
                                    onClick={() => setShowAddActivity(true)}
                                    className="w-full mb-4 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:border-[#0052FF] hover:text-[#0052FF] hover:bg-[#0052FF]/5 transition-all flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    Aktivitat hinzufugen
                                </button>
                            ) : (
                                /* Add Activity Form */
                                <div className="mb-5 bg-gray-50 rounded-xl border border-gray-200 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-semibold text-gray-900">Neue Aktivitat</h4>
                                        <button
                                            onClick={() => setShowAddActivity(false)}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Activity Type Selection */}
                                    <div className="flex gap-2 mb-3">
                                        {ACTIVITY_TYPES.map((type) => (
                                            <button
                                                key={type.id}
                                                onClick={() => setNewActivity({ ...newActivity, type: type.id })}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                                    newActivity.type === type.id
                                                        ? 'bg-[#0052FF] text-white'
                                                        : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                                                }`}
                                            >
                                                {getActivityIcon(type.id)}
                                                {type.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Title */}
                                    <input
                                        type="text"
                                        value={newActivity.title}
                                        onChange={(e) => setNewActivity({ ...newActivity, title: e.target.value })}
                                        placeholder="z.B. Erstgesprach gefuhrt, Termin vereinbart..."
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2 focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none"
                                    />

                                    {/* Description */}
                                    <textarea
                                        value={newActivity.description}
                                        onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                                        placeholder="Optionale Beschreibung..."
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2 resize-none h-16 focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none"
                                    />

                                    {/* Date + Save */}
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="datetime-local"
                                            value={newActivity.date}
                                            onChange={(e) => setNewActivity({ ...newActivity, date: e.target.value })}
                                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none"
                                        />
                                        <button
                                            onClick={handleAddActivity}
                                            disabled={!newActivity.title.trim() || savingActivity}
                                            className="px-4 py-2 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] disabled:opacity-50 transition-colors"
                                        >
                                            {savingActivity ? 'Speichert...' : 'Hinzufugen'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Activities Timeline */}
                            {loadingActivities ? (
                                <div className="flex justify-center py-8">
                                    <div className="w-6 h-6 border-2 border-[#0052FF] border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : activities.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm text-gray-400">Noch keine Aktivitaten</p>
                                    <p className="text-xs text-gray-300 mt-1">Fugen Sie Anrufe, Meetings oder Notizen hinzu</p>
                                </div>
                            ) : (
                                <div className="relative">
                                    {/* Timeline line */}
                                    <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gray-200"></div>

                                    <div className="space-y-4">
                                        {activities.map((activity) => {
                                            const colors = getActivityColor(activity.activity_type);
                                            return (
                                                <div key={activity.id} className="flex gap-3 relative">
                                                    {/* Timeline dot */}
                                                    <div className={`w-10 h-10 rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center flex-shrink-0 relative z-10 ${colors.text}`}>
                                                        {getActivityIcon(activity.activity_type)}
                                                    </div>

                                                    {/* Content */}
                                                    <div className="flex-1 min-w-0 pb-1">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                                                                {activity.description && (
                                                                    <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{activity.description}</p>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                                                                {formatActivityDate(activity.activity_date)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                                                                {ACTIVITY_TYPES.find(t => t.id === activity.activity_type)?.label || activity.activity_type}
                                                            </span>
                                                            <span className="text-[10px] text-gray-300">
                                                                {new Date(activity.activity_date).toLocaleDateString('de-DE', {
                                                                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                                                })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50">
                    <div className="flex gap-3">
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                            title="Lead löschen"
                        >
                            {deleting ? (
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            )}
                        </button>
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            Schliessen
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 bg-[#0052FF] text-white rounded-xl text-sm font-medium hover:bg-[#0047E1] disabled:opacity-50 transition-colors"
                        >
                            {saving ? 'Speichert...' : 'Speichern'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
