import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Camera, 
  Upload, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  ShieldAlert, 
  Loader2, 
  RotateCcw,
  Sparkles,
  Info,
  Check
} from 'lucide-react';
import { RailwayCrossing, CrossingObservedStatus, CrossingSurveyInput } from '../types';
import { railwayApi } from '../services/apiService';
import { nativeService } from '../services/nativeService';
import { geofenceService } from '../services/geofenceService';
import { formatDistance } from '../utils/geoUtils';
import { INITIAL_CROSSINGS } from '../services/amritsarData';

interface CrossingSurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  crossings?: RailwayCrossing[];
  initialCrossing?: RailwayCrossing | null;
  crossing?: RailwayCrossing | null;
  onSurveySubmitted?: (result: any) => void;
  onSuccess?: (result: any) => void;
}

export const CrossingSurveyModal: React.FC<CrossingSurveyModalProps> = ({
  isOpen,
  onClose,
  crossings = [],
  initialCrossing,
  crossing,
  onSurveySubmitted,
  onSuccess
}) => {
  const activeInitial = crossing || initialCrossing;
  const availableCrossings = crossings.length > 0 
    ? crossings 
    : (activeInitial 
        ? [activeInitial, ...INITIAL_CROSSINGS.filter(c => c.id !== activeInitial.id)] 
        : INITIAL_CROSSINGS);
  const [selectedCrossingId, setSelectedCrossingId] = useState<string>(activeInitial?.id || (availableCrossings[0]?.id ?? ''));
  const [observedStatus, setObservedStatus] = useState<CrossingObservedStatus>('CLOSED');
  const [timeOffsetMinutes, setTimeOffsetMinutes] = useState<number>(0);
  const [waitingMinutes, setWaitingMinutes] = useState<number>(3);
  const [notes, setNotes] = useState<string>('');
  
  // Photo capture state
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [captureSource, setCaptureSource] = useState<'CAMERA_LIVE' | 'GALLERY_UPLOAD' | 'NO_PHOTO'>('NO_PHOTO');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  // Submission & validation state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{
    message: string;
    validationStatus: string;
    isPhotoVerified: boolean;
    distanceMeters?: number | null;
  } | null>(null);

  // User position & distance
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Initialize selected crossing and user location
  useEffect(() => {
    if (isOpen) {
      if (activeInitial) {
        setSelectedCrossingId(activeInitial.id);
      } else if (availableCrossings.length > 0 && !selectedCrossingId) {
        setSelectedCrossingId(availableCrossings[0].id);
      }

      setSubmitError(null);
      setSubmitSuccess(null);

      // Fetch latest coordinates
      const profile = nativeService.getUserLocationProfile();
      const lastGeo = geofenceService.getLastKnownPosition();
      const lat = lastGeo?.lat || profile?.lat || null;
      const lng = lastGeo?.lng || profile?.lng || null;
      if (lat !== null && lng !== null) {
        setUserCoords({ lat, lng });
      }
    }
  }, [isOpen, activeInitial, availableCrossings]);

  // Compute distance to selected crossing
  const currentCrossing = availableCrossings.find(c => c.id === selectedCrossingId) || activeInitial;

  useEffect(() => {
    if (userCoords && currentCrossing) {
      const R = 6371e3;
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const dLat = toRad(currentCrossing.lat - userCoords.lat);
      const dLon = toRad(currentCrossing.lng - userCoords.lng);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(userCoords.lat)) * Math.cos(toRad(currentCrossing.lat)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      setDistanceMeters(Math.round(R * c));
    } else {
      setDistanceMeters(null);
    }
  }, [userCoords, currentCrossing]);

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>, source: 'CAMERA_LIVE' | 'GALLERY_UPLOAD') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setSubmitError('Photo is larger than 10MB limit. Please capture a lower resolution photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPhotoBase64(result);
      setPhotoPreview(result);
      setCaptureSource(source);
      setSubmitError(null);
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoBase64(null);
    setPhotoPreview(null);
    setCaptureSource('NO_PHOTO');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCrossingId) {
      setSubmitError('Please select a railway crossing.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const observationDate = new Date(Date.now() - timeOffsetMinutes * 60 * 1000);

      const surveyInput: CrossingSurveyInput = {
        crossingId: selectedCrossingId,
        observedStatus,
        observationTime: observationDate.toISOString(),
        waitingDurationSec: waitingMinutes > 0 ? waitingMinutes * 60 : undefined,
        notes: notes.trim() || undefined,
        photoBase64: photoBase64 || undefined,
        captureSource,
        submitterLat: userCoords?.lat || undefined,
        submitterLng: userCoords?.lng || undefined
      };

      const result = await railwayApi.submitCrossingSurvey(surveyInput);
      setSubmitSuccess({
        message: result.message || 'Survey recorded successfully.',
        validationStatus: result.validationStatus,
        isPhotoVerified: result.isPhotoVerified,
        distanceMeters: result.distanceToCrossingMeters
      });

      if (onSurveySubmitted) {
        onSurveySubmitted(result);
      }
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit survey. Please check connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
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
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShieldCheck size={20} color="#10B981" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-primary, #F8FAFC)' }}>
                Verify Fatak Status
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #94A3B8)' }}>
                Help fellow commuters with real-time gate updates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
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

        {/* MODAL BODY */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {submitSuccess ? (
            <div style={{ textAlign: 'center', padding: '24px 8px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '2px solid rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}>
                <CheckCircle2 size={36} color="#10B981" />
              </div>

              <h3 style={{ margin: '0 0 8px 0', fontSize: '19px', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                Survey Submitted!
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '13.5px', color: 'var(--text-muted, #94A3B8)' }}>
                {submitSuccess.message}
              </p>

              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '20px',
                textAlign: 'left',
                fontSize: '12.5px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted, #94A3B8)' }}>Verification Status:</span>
                  <span style={{
                    fontWeight: 700,
                    color: submitSuccess.validationStatus === 'COMMUNITY_CONFIRMED' ? '#38BDF8' : '#F59E0B'
                  }}>
                    {submitSuccess.validationStatus === 'COMMUNITY_CONFIRMED' ? 'COMMUNITY CONFIRMED' : 'UPDATE RECEIVED'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted, #94A3B8)' }}>Photo Verification:</span>
                  <span style={{ fontWeight: 600, color: submitSuccess.isPhotoVerified ? '#10B981' : '#94A3B8' }}>
                    {submitSuccess.isPhotoVerified ? '✓ Camera Photo Verified' : 'Standard Submission'}
                  </span>
                </div>
                {submitSuccess.distanceMeters !== undefined && submitSuccess.distanceMeters !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted, #94A3B8)' }}>Distance to Track:</span>
                    <span style={{ fontWeight: 600, color: submitSuccess.distanceMeters <= 500 ? '#10B981' : '#F59E0B' }}>
                      ~{submitSuccess.distanceMeters}m
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#10B981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* SAFETY NOTICE */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '11.5px',
                color: '#FCA5A5'
              }}>
                <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  <strong>Safety First:</strong> Never stop on railway tracks or use your device in active vehicle traffic or hazardous track zones. Only survey from safe pedestrian areas.
                </span>
              </div>

              {/* CROSSING SELECTION */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary, #CBD5E1)', marginBottom: '6px' }}>
                  Target Level Crossing
                </label>
                <select
                  value={selectedCrossingId}
                  onChange={(e) => setSelectedCrossingId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#1E293B',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#F8FAFC',
                    fontSize: '14px',
                    fontWeight: 500,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {availableCrossings.map(c => (
                    <option
                      key={c.id}
                      value={c.id}
                      style={{
                        backgroundColor: '#0F172A',
                        color: '#F8FAFC',
                        padding: '8px',
                        fontSize: '13.5px'
                      }}
                    >
                      {c.name} {c.punjabiName ? `(${c.punjabiName})` : ''} {c.line ? `• ${c.line}` : ''}
                    </option>
                  ))}
                </select>

                {distanceMeters !== null && (
                  <div style={{
                    marginTop: '6px',
                    fontSize: '11.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: distanceMeters <= 500 ? '#10B981' : distanceMeters <= 1500 ? '#F59E0B' : '#EF4444'
                  }}>
                    <MapPin size={13} />
                    <span>
                      {distanceMeters <= 500
                        ? `~${distanceMeters}m away — In Field Verification Zone`
                        : distanceMeters <= 1500
                        ? `~${(distanceMeters / 1000).toFixed(1)}km away — Moderate Distance`
                        : `~${(distanceMeters / 1000).toFixed(1)}km away — Far distance will be flagged`}
                    </span>
                  </div>
                )}
              </div>

              {/* OBSERVED STATUS BUTTONS */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary, #CBD5E1)', marginBottom: '8px' }}>
                  Observed Physical Gate State
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { key: 'OPEN', label: 'OPEN', desc: 'Barriers Up · Safe', color: '#10B981', bg: 'rgba(16, 185, 129, 0.12)' },
                    { key: 'CLOSED', label: 'CLOSED', desc: 'Barriers Locked', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)' },
                    { key: 'TRAIN_PASSING', label: 'TRAIN PASSING', desc: 'Train on Crossing', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)' },
                    { key: 'GATE_REOPENING', label: 'REOPENING', desc: 'Barriers Lifting', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.12)' }
                  ].map(opt => {
                    const isSelected = observedStatus === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setObservedStatus(opt.key as CrossingObservedStatus)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: isSelected ? `2px solid ${opt.color}` : '1px solid rgba(255, 255, 255, 0.1)',
                          backgroundColor: isSelected ? opt.bg : 'rgba(255, 255, 255, 0.03)',
                          color: isSelected ? opt.color : 'var(--text-muted, #94A3B8)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>{opt.label}</div>
                        <div style={{ fontSize: '11px', opacity: 0.85 }}>{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* MANDATORY PHOTO EVIDENCE */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary, #CBD5E1)' }}>
                    Photo Evidence
                  </label>
                  <span style={{ fontSize: '11px', color: '#10B981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <ShieldCheck size={12} /> Required for Photo-Verified Tier
                  </span>
                </div>

                {photoPreview ? (
                  <div style={{
                    position: 'relative',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    maxHeight: '180px'
                  }}>
                    <img 
                      src={photoPreview} 
                      alt="Captured Crossing" 
                      style={{ width: '100%', height: '180px', objectFit: 'cover' }} 
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '8px',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: captureSource === 'CAMERA_LIVE' ? '#10B981' : '#F59E0B',
                      fontWeight: 600
                    }}>
                      {captureSource === 'CAMERA_LIVE' ? '✓ Live Camera Capture' : 'Gallery Upload'}
                    </div>
                    <button
                      type="button"
                      onClick={removePhoto}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        backgroundColor: 'rgba(239, 68, 68, 0.85)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '26px',
                        height: '26px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {/* Live Camera Button */}
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      style={{
                        padding: '14px 10px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        border: '1px dashed rgba(16, 185, 129, 0.4)',
                        color: '#10B981',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Camera size={22} />
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>Capture with Camera</span>
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>Qualifies for Verification</span>
                    </button>

                    {/* Gallery Button */}
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      style={{
                        padding: '14px 10px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px dashed rgba(255, 255, 255, 0.15)',
                        color: 'var(--text-muted, #94A3B8)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Upload size={22} />
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>Upload File</span>
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>Stricter Moderation</span>
                    </button>
                  </div>
                )}

                {/* Hidden File Inputs */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhotoFile(e, 'CAMERA_LIVE')}
                  style={{ display: 'none' }}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handlePhotoFile(e, 'GALLERY_UPLOAD')}
                  style={{ display: 'none' }}
                />
              </div>

              {/* OBSERVATION TIMING & WAITING */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #CBD5E1)', marginBottom: '4px' }}>
                    When observed?
                  </label>
                  <select
                    value={timeOffsetMinutes}
                    onChange={(e) => setTimeOffsetMinutes(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-secondary, #1E293B)',
                      border: '1px solid var(--border-soft, rgba(255, 255, 255, 0.12))',
                      color: 'var(--text-primary, #F8FAFC)',
                      fontSize: '12.5px'
                    }}
                  >
                    <option value={0}>Just now (live)</option>
                    <option value={2}>2 minutes ago</option>
                    <option value={5}>5 minutes ago</option>
                    <option value={10}>10 minutes ago</option>
                    <option value={15}>15 minutes ago</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #CBD5E1)', marginBottom: '4px' }}>
                    Traffic wait (min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={waitingMinutes}
                    onChange={(e) => setWaitingMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-secondary, #1E293B)',
                      border: '1px solid var(--border-soft, rgba(255, 255, 255, 0.12))',
                      color: 'var(--text-primary, #F8FAFC)',
                      fontSize: '12.5px'
                    }}
                  />
                </div>
              </div>

              {/* NOTES */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #CBD5E1)', marginBottom: '4px' }}>
                  Additional Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  placeholder="e.g. Traffic queue extending past main junction, boom barrier locked..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-secondary, #1E293B)',
                    border: '1px solid var(--border-soft, rgba(255, 255, 255, 0.12))',
                    color: 'var(--text-primary, #F8FAFC)',
                    fontSize: '12.5px',
                    resize: 'none'
                  }}
                />
              </div>

              {/* ERROR ALERT */}
              {submitError && (
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#FCA5A5',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>{submitError}</span>
                </div>
              )}

              {/* SUBMIT BUTTON */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: isSubmitting ? '#475569' : '#10B981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '4px'
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Uploading & Validating Survey...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Submit Verification Survey</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};
