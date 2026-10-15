import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  ShieldCheck, 
  ExternalLink,
  Loader2,
  RefreshCw,
  Camera
} from 'lucide-react';
import { railwayApi } from '../services/apiService';

interface UserSurveysModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewSurvey?: () => void;
}

export const UserSurveysModal: React.FC<UserSurveysModalProps> = ({
  isOpen,
  onClose,
  onOpenNewSurvey
}) => {
  const [surveys, setSurveys] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSurveys = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await railwayApi.getUserSurveys();
      setSurveys(data);
    } catch (err: any) {
      setError(err.message || 'Could not load your surveys.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSurveys();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '85vh',
          backgroundColor: 'var(--bg-primary, #0c1222)',
          border: '1px solid var(--border-soft, rgba(255, 255, 255, 0.1))',
          borderRadius: '18px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* HEADER */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid var(--border-soft, rgba(255, 255, 255, 0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShieldCheck size={20} color="#38BDF8" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 700, color: 'var(--text-primary, #F8FAFC)' }}>
                My Gate Reports
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #94A3B8)' }}>
                Your contributed crossing updates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px',
              borderRadius: '8px',
              cursor: 'pointer',
              color: 'var(--text-muted, #94A3B8)'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '12px' }}>
              <Loader2 size={24} className="animate-spin" color="#38BDF8" />
              <span style={{ fontSize: '13px', color: 'var(--text-muted, #94A3B8)' }}>Loading your reports...</span>
            </div>
          ) : error ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <AlertTriangle size={28} color="#EF4444" style={{ margin: '0 auto 8px auto' }} />
              <p style={{ fontSize: '13px', color: '#FCA5A5', margin: '0 0 12px 0' }}>Report information is temporarily unavailable. Please try again.</p>
              <button
                onClick={fetchSurveys}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12.5px',
                  cursor: 'pointer'
                }}
              >
                Retry
              </button>
            </div>
          ) : surveys.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 12px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto'
              }}>
                <Clock size={22} color="var(--text-muted, #94A3B8)" />
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', color: 'var(--text-primary, #fff)' }}>
                No reports submitted yet
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: 'var(--text-muted, #94A3B8)', maxWidth: '320px', marginInline: 'auto' }}>
                When you are near a railway crossing, report whether the gates are open or closed to help fellow commuters.
              </p>
              {onOpenNewSurvey && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenNewSurvey();
                  }}
                  style={{
                    padding: '9px 16px',
                    backgroundColor: '#10B981',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Submit First Survey
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {surveys.map(s => {
                const isConfirmed = s.validation_status === 'COMMUNITY_CONFIRMED' || s.validation_status === 'APPROVED';
                const isFlagged = s.validation_status === 'FLAGGED' || s.validation_status === 'REJECTED';
                
                return (
                  <div
                    key={s.id}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary, #F8FAFC)' }}>
                        {s.crossing_name}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        backgroundColor: isConfirmed ? 'rgba(56, 189, 248, 0.15)' : isFlagged ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: isConfirmed ? '#38BDF8' : isFlagged ? '#EF4444' : '#F59E0B',
                        border: isConfirmed ? '1px solid rgba(56, 189, 248, 0.3)' : isFlagged ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
                      }}>
                        {s.validation_status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-muted, #94A3B8)' }}>
                      <span>
                        Status: <strong style={{ color: s.observed_status === 'OPEN' ? '#10B981' : '#EF4444' }}>{s.observed_status}</strong>
                      </span>
                      <span>·</span>
                      <span>{new Date(s.observation_time || s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {s.is_photo_verified && (
                        <>
                          <span>·</span>
                          <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <Camera size={11} /> Photo Verified
                          </span>
                        </>
                      )}
                    </div>

                    {s.notes && (
                      <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary, #CBD5E1)', fontStyle: 'italic' }}>
                        "{s.notes}"
                      </p>
                    )}

                    {s.photoUrl && (
                      <div style={{ marginTop: '4px' }}>
                        <img 
                          src={s.photoUrl} 
                          alt="Survey Observation" 
                          style={{ width: '100%', maxHeight: '110px', objectFit: 'cover', borderRadius: '8px' }} 
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
