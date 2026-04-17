'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Building2, Hash, Edit3 } from 'lucide-react';

export interface AddressDetails {
  street: string;
  houseNumber: string;
  boxAppt: string;
  postalCode: string;
  city: string;
}

interface AddressAutocompleteProps {
  // Pass down the fully concatenated address if applicable
  value?: string;
  // This will return the concatenated string, location, and the granular breakdown!
  onChange: (formattedString: string, location?: { lat: number; lng: number }, details?: AddressDetails) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({ value, onChange, placeholder = "Search for your address...", className }: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  
  // Local state to prevent the input from locking up when typing!
  const [searchValue, setSearchValue] = useState(value || '');
  
  // Breakdown State
  const [details, setDetails] = useState<AddressDetails>({
    street: '',
    houseNumber: '',
    boxAppt: '',
    postalCode: '',
    city: ''
  });
  
  const [showGranular, setShowGranular] = useState(false);
  const onChangeRef = useRef(onChange);
  
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Google Maps Initialization
  useEffect(() => {
    if (document.querySelector('#google-maps-script') || (window as any).google?.maps?.places) {
      setIsScriptLoaded(true);
      return;
    }

    const apiKey = "AIzaSyDzrdK6kOwUuDQ-1XPizCrTf5DHW5dAJuI";
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!isScriptLoaded || !inputRef.current || !(window as any).google?.maps?.places) return;

    try {
      const autocomplete = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'be' }, 
        fields: ['formatted_address', 'address_components', 'geometry'],
        types: ['address']
      });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') e.preventDefault();
      };
      inputRef.current.addEventListener('keydown', handleKeyDown);

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place && place.formatted_address) {
          let loc;
          if (place.geometry && place.geometry.location) {
            loc = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
          }
          
          let parsed: AddressDetails = { street: '', houseNumber: '', boxAppt: '', postalCode: '', city: '' };
          
          if (place.address_components) {
            place.address_components.forEach((c: any) => {
              if (c.types.includes('route')) parsed.street = c.long_name;
              if (c.types.includes('street_number')) parsed.houseNumber = c.long_name;
              if (c.types.includes('locality')) parsed.city = c.long_name;
              if (c.types.includes('postal_code')) parsed.postalCode = c.long_name;
            });
          }

          setSearchValue(place.formatted_address);
          setDetails({...parsed, boxAppt: ''}); 
          setShowGranular(true); // Open the breakdown panel!
          
          onChangeRef.current(place.formatted_address, loc, { ...parsed, boxAppt: '' });
        }
      });

      return () => {
        if (inputRef.current) inputRef.current.removeEventListener('keydown', handleKeyDown);
        if ((window as any).google?.maps?.event?.clearInstanceListeners) {
          (window as any).google.maps.event.clearInstanceListeners(autocomplete);
        }
      };
    } catch (err) {
      console.warn("Maps init failed", err);
    }
  }, [isScriptLoaded]);

  // Handle manual changes to granular fields
  const handleDetailChange = (field: keyof AddressDetails, val: string) => {
    const newDetails = { ...details, [field]: val };
    setDetails(newDetails);
    
    // Reconstruct the string
    const parts = [];
    if (newDetails.street) parts.push(newDetails.street);
    const numBox = [newDetails.houseNumber, newDetails.boxAppt ? `Box ${newDetails.boxAppt}` : ''].filter(Boolean).join(' - ');
    if (numBox) parts.push(numBox);
    const cityZip = [newDetails.postalCode, newDetails.city].filter(Boolean).join(' ');
    
    const formatted = `${parts.join(', ')}${cityZip ? ', ' + cityZip : ''}`;
    
    // Fire to parent purely as a string update
    onChangeRef.current(formatted, undefined, newDetails);
  };

  // Fire manual typings passively to parent without disrupting Google bounds
  const handleManualSearchType = () => {
     if (!inputRef.current) return;
     const val = inputRef.current.value;
     onChangeRef.current(val, undefined, details);
  };

  // Keep the external value synced on mount if it exists
  useEffect(() => {
    if (inputRef.current && value && !inputRef.current.value) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <div className="space-y-4">
      {/* Primary Autocomplete Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MapPin className="h-5 w-5 text-amber-500" />
        </div>
        <input
          ref={inputRef}
          type="text"
          defaultValue={value || ''}
          onInput={handleManualSearchType}
          className={`w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold placeholder-slate-400 text-slate-800 shadow-sm transition-all ${className || ''}`}
          placeholder={placeholder}
          autoComplete="off"
        />
      </div>

      {/* Extracted Granular Fields */}
      {showGranular && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
          
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Street</label>
            <input 
              type="text"
              value={details.street}
              onChange={e => handleDetailChange('street', e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-slate-700 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
            />
          </div>
          
          <div className="col-span-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Number</label>
            <div className="relative">
              <Hash className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="text"
                value={details.houseNumber}
                onChange={e => handleDetailChange('houseNumber', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-slate-700 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
              />
            </div>
          </div>

          <div className="col-span-1">
            <label className="block text-[11px] font-bold text-amber-600 uppercase tracking-wider mb-1">Appt / Box</label>
            <div className="relative">
              <Building2 className="absolute left-2.5 top-2.5 h-4 w-4 text-amber-400" />
              <input 
                type="text"
                placeholder="e.g. 4B"
                value={details.boxAppt}
                onChange={e => handleDetailChange('boxAppt', e.target.value)}
                className="w-full bg-amber-50/50 border border-amber-200 rounded-lg py-2 pl-9 pr-3 text-slate-900 focus:ring-amber-500 focus:border-amber-500 text-sm font-bold placeholder-amber-200"
              />
            </div>
          </div>

          <div className="col-span-2 flex gap-4">
            <div className="w-1/3">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Zip</label>
              <input 
                type="text"
                value={details.postalCode}
                onChange={e => handleDetailChange('postalCode', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-slate-700 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">City</label>
              <input 
                type="text"
                value={details.city}
                onChange={e => handleDetailChange('city', e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-slate-700 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
              />
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
