'use client';

import { useState, useEffect } from 'react';
import LeadDetailModal from '@/components/LeadDetailModal';

interface Lead {
    id: string;
    email: string;
    phone: string;
    full_name: string;
    status: string;
    quality_status: string;
    quality_feedback_sent: boolean;
    form_id: string | null;
    form_name: string | null;
    created_at: string;
    assigned_to: string | null;
    assignee_name: string | null;
    notes: string | null;
    raw_data?: any;
}

interface TeamMember {
    id: string;
    full_name: string;
    email: string;
}

interface FormOption {
    form_id: string;
    form_name: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    new: { label: 'Neu', color: 'text-amber-700', bg: 'bg-amber-50' },
    contacted: { label: 'Kontaktiert', color: 'text-blue-700', bg: 'bg-blue-50' },
    interested: { label: 'Interessiert', color: 'text-purple-700', bg: 'bg-purple-50' },
    meeting: { label: 'Termin', color: 'text-indigo-700', bg: 'bg-indigo-50' },
    qualified: { label: 'Qualifiziert', color: 'text-green-700', bg: 'bg-green-50' },
    won: { label: 'Gewonnen', color: 'text-green-700', bg: 'bg-green-50' },
    unqualified: { label: 'Unqualifiziert', color: 'text-red-700', bg: 'bg-red-50' },
    lost: { label: 'Verloren', color: 'text-red-700', bg: 'bg-red-50' },
};

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [forms, setForms] = useState<FormOption[]>([]);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [formFilter, setFormFilter] = useState<string>('');
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 12;

    useEffect(() => {
        fetchLeads();
        fetchTeamMembers();
        setCurrentPage(1);
    }, [filter, formFilter]);

    // Reset to page 1 when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const fetchTeamMembers = async () => {
        try {
            const res = await fetch('/api/team');
            const data = await res.json();
            setTeamMembers(data.members || []);
        } catch (error) {
            console.error('Error fetching team:', error);
        }
    };

    const fetchLeads = async () => {
        setLoading(true);
        try {
            let url = '/api/leads?limit=10000&';
            if (filter !== 'all') {
                url += `status=${filter}&`;
            }
            if (formFilter) {
                url += `form_id=${formFilter}&`;
            }
            const res = await fetch(url);
            const data = await res.json();
            setLeads(data.leads || []);
            setForms(data.forms || []);
            setTotalCount(data.pagination?.total ?? (data.leads || []).length);
        } catch (error) {
            console.error('Error fetching leads:', error);
        }
        setLoading(false);
    };

    const createTestLead = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/leads/test', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                await fetchLeads();
            }
        } catch (error) {
            console.error('Error creating test lead:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
        });
    };

    const filteredLeads = leads.filter(lead => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            lead.full_name?.toLowerCase().includes(query) ||
            lead.email?.toLowerCase().includes(query) ||
            lead.phone?.includes(query)
        );
    });

    // Stats
    const totalLeads = totalCount;
    const newLeads = leads.filter(l => l.status === 'new').length;
    const qualifiedLeads = leads.filter(l => l.status === 'qualified' || l.status === 'won').length;
    const unqualifiedLeads = leads.filter(l => l.status === 'unqualified' || l.status === 'lost').length;

    // Pagination
    const totalPages = Math.ceil(filteredLeads.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedLeads = filteredLeads.slice(startIndex, startIndex + itemsPerPage);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
                    <p className="text-gray-500 text-sm mt-1">Alle eingegangenen Leads verwalten</p>
                </div>
                <button
                    onClick={createTestLead}
                    disabled={loading}
                    className="px-4 py-2.5 bg-[#0052FF] text-white rounded-lg font-medium hover:bg-[#0047E1] transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Test-Lead
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#0052FF]/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-[#0052FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Gesamt</p>
                            <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Neu</p>
                            <p className="text-2xl font-bold text-amber-600">{newLeads}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Qualifiziert</p>
                            <p className="text-2xl font-bold text-green-600">{qualifiedLeads}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Unqualifiziert</p>
                            <p className="text-2xl font-bold text-red-600">{unqualifiedLeads}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex flex-wrap gap-4 items-center">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Suchen nach Name, E-Mail, Telefon..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none"
                        />
                    </div>

                    {/* Status Filter */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        {[
                            { id: 'all', label: 'Alle' },
                            { id: 'new', label: 'Neu' },
                            { id: 'contacted', label: 'Kontaktiert' },
                            { id: 'qualified', label: 'Qualifiziert' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setFilter(tab.id)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${filter === tab.id
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Form Filter */}
                    <select
                        value={formFilter}
                        onChange={(e) => setFormFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none"
                    >
                        <option value="">Alle Formulare</option>
                        {forms.map((f) => (
                            <option key={f.form_id} value={f.form_id}>{f.form_name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Leads Grid */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-[#0052FF] border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : filteredLeads.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Keine Leads gefunden</h3>
                    <p className="text-gray-500 mb-6">Erstelle einen Test-Lead oder verbinde Meta Lead Ads</p>
                    <button
                        onClick={createTestLead}
                        className="px-6 py-2.5 bg-[#0052FF] text-white rounded-lg font-medium hover:bg-[#0047E1] transition-colors"
                    >
                        Test-Lead erstellen
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {paginatedLeads.map((lead) => {
                        const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;
                        return (
                            <div
                                key={lead.id}
                                onClick={() => setSelectedLead(lead)}
                                className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-lg hover:border-gray-300 transition-all"
                            >
                                {/* Form Name Tag */}
                                {lead.form_name && (
                                    <div className="text-[10px] font-medium text-[#0052FF] bg-[#0052FF]/10 px-1.5 py-0.5 rounded inline-block mb-2">
                                        {lead.form_name}
                                    </div>
                                )}
                                {/* Header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0052FF] to-[#0047E1] flex items-center justify-center text-white font-semibold">
                                            {lead.full_name?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900 truncate max-w-[150px]">
                                                {lead.full_name || 'Unbekannt'}
                                            </h3>
                                            <p className="text-xs text-gray-500">{formatDate(lead.created_at)}</p>
                                        </div>
                                    </div>
                                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
                                        {statusConfig.label}
                                    </span>
                                </div>

                                {/* Contact Info */}
                                <div className="space-y-2 mb-3">
                                    {lead.email && (
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                            <span className="truncate">{lead.email}</span>
                                        </div>
                                    )}
                                    {lead.phone && (
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                            </svg>
                                            <span>{lead.phone}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Notes Preview */}
                                {lead.notes && (
                                    <div className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg p-2 mb-3 line-clamp-2">
                                        {lead.notes}
                                    </div>
                                )}

                                {/* Footer */}
                                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                    {lead.assigned_to ? (
                                        <div className="flex items-center gap-1 text-xs text-gray-500">
                                            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px]">
                                                {lead.assignee_name?.charAt(0) || '?'}
                                            </div>
                                            <span className="truncate max-w-[80px]">{lead.assignee_name}</span>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">Nicht zugewiesen</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {!loading && filteredLeads.length > 0 && totalPages > 1 && (
                <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
                    <div className="text-sm text-gray-500">
                        Zeige {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredLeads.length)} von {filteredLeads.length} Leads
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Zurück
                        </button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(page => {
                                    // Show first, last, current, and pages around current
                                    return page === 1 ||
                                           page === totalPages ||
                                           Math.abs(page - currentPage) <= 1;
                                })
                                .map((page, idx, arr) => {
                                    // Add ellipsis if there's a gap
                                    const showEllipsisBefore = idx > 0 && page - arr[idx - 1] > 1;
                                    return (
                                        <span key={page} className="flex items-center">
                                            {showEllipsisBefore && (
                                                <span className="px-2 text-gray-400">...</span>
                                            )}
                                            <button
                                                onClick={() => setCurrentPage(page)}
                                                className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                                                    currentPage === page
                                                        ? 'bg-[#0052FF] text-white'
                                                        : 'hover:bg-gray-100 text-gray-700'
                                                }`}
                                            >
                                                {page}
                                            </button>
                                        </span>
                                    );
                                })}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Weiter
                        </button>
                    </div>
                </div>
            )}

            {/* Modal */}
            {selectedLead && (
                <LeadDetailModal
                    lead={selectedLead}
                    teamMembers={teamMembers}
                    onClose={() => setSelectedLead(null)}
                    onUpdate={() => {
                        fetchLeads();
                        setSelectedLead(null);
                    }}
                />
            )}
        </div>
    );
}
