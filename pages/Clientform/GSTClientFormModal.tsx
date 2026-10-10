import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Client, 
  ConstitutionType, 
  GstRegType, 
  GstFilingFreq, 
  ClientStatus, 
  Stakeholder, 
  GstStatus, 
  JurisdictionType 
} from '../../types.ts';
import { api } from '../../services/api.ts';
import { toast } from 'sonner';

interface GSTClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (client: Client) => void;
  initialData?: Client | null;
}

// Map of Indian GST state code to state name
const GST_STATE_MAP: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '28': 'Andhra Pradesh',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh'
};

const FORM_TABS = [
  { id: 1, name: '1. Basic Details & Login', short: 'Basic Details', icon: '🔑' },
  { id: 2, name: '2. Contact & GST Info', short: 'Contact & GST', icon: '🏛️' },
  { id: 3, name: '3. Owner & Stakeholders', short: 'Owner / Partners', icon: '👤' },
  { id: 4, name: '4. Bank & Other Portals', short: 'Bank & Portals', icon: '🏦' },
];

const GSTClientFormModal: React.FC<GSTClientFormModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData 
}) => {
  const queryClient = useQueryClient();
  const [activeTabStep, setActiveTabStep] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showEwayPass, setShowEwayPass] = useState(false);
  const [showGstatPass, setShowGstatPass] = useState(false);
  const [isDataLinked, setIsDataLinked] = useState(false);
  const [linkedClientName, setLinkedClientName] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const { data: existingClientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.getClients(),
    staleTime: 1000 * 60 * 5,
    enabled: isOpen,
  });

  const existingClients = useMemo(() => existingClientsData || [], [existingClientsData]);

  const saveMutation = useMutation({
    mutationFn: (clientData: Partial<Client>) => api.saveClient(clientData),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['gst_clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      window.dispatchEvent(new Event('clientify_db_change'));
      toast.success(initialData ? 'GST profile updated successfully!' : 'New GST client added successfully!');
      onSave(saved);
      onClose();
    },
    onError: (err: any) => {
      setError(err.message || "Failed to save client details. Please try again.");
    }
  });

  const isSaving = saveMutation.isPending;

  const createStakeholder = (): Stakeholder => ({
    id: Math.random().toString(36).substr(2, 9),
    name: '',
    mobile: '',
    pan: '',
    email: '',
    itPassword: '',
    address: ''
  });

  const [formData, setFormData] = useState<Partial<Client>>({
    legalName: '',
    tradeName: '',
    email: '',
    address: '',
    mobile: '',
    dob: '',
    status: 'Active',
    gstProfile: {
      gstin: '',
      pan: '',
      username: '',
      password: '',
      gstStatus: 'Active',
      regDate: '',
      cancelDate: '',
      regType: 'Regular',
      filingFreq: 'Monthly',
      constitution: 'Proprietorship',
      dob: '',
      stakeholders: [createStakeholder()],
      accountantName: '',
      accountantMobile: '',
      address: '',
      jurisdictionType: 'State',
      sector: '',
      range: '',
      ewayBillId: '',
      ewayBillPass: '',
      gstatId: '',
      gstatPass: ''
    },
    bankDetails: { bankName: '', accountNo: '', ifsc: '' },
    remarks: ''
  });

  useEffect(() => {
    if (isOpen) {
      setActiveTabStep(1);
      setError(null);
      if (initialData) {
        const existingStakeholders = initialData.gstProfile?.stakeholders;
        const validStakeholders = (Array.isArray(existingStakeholders) && existingStakeholders.length > 0)
          ? existingStakeholders
          : [createStakeholder()];

        const constitution = initialData.gstProfile?.constitution || 'Proprietorship';
        if (constitution === 'Proprietorship' && validStakeholders.length > 0) {
          const first = validStakeholders[0];
          const propName = initialData.legalName || first.name || initialData.tradeName || '';
          validStakeholders[0] = {
            ...first,
            name: propName,
            pan: first.pan || initialData.gstProfile?.pan || '',
            mobile: first.mobile || initialData.mobile || '',
            email: first.email || initialData.email || '',
          };
          initialData.legalName = propName;
        } else if (constitution !== 'Proprietorship') {
          const common = initialData.tradeName || initialData.legalName || '';
          initialData.tradeName = common;
          initialData.legalName = common;
        }

        const initialDob = initialData.dob || initialData.gstProfile?.dob || '';
        setFormData({
          ...initialData,
          dob: initialDob,
          gstProfile: {
            gstin: '',
            pan: '',
            username: '',
            password: '',
            gstStatus: 'Active',
            regDate: '',
            cancelDate: '',
            regType: 'Regular',
            filingFreq: 'Monthly',
            constitution: 'Proprietorship',
            dob: initialDob,
            accountantName: '',
            accountantMobile: '',
            address: '',
            jurisdictionType: 'State',
            sector: '',
            range: '',
            ewayBillId: '',
            ewayBillPass: '',
            gstatId: '',
            gstatPass: '',
            ...(initialData.gstProfile || {}),
            stakeholders: validStakeholders
          }
        });
        setIsDataLinked(false);
      } else {
        resetForm();
      }
    }
  }, [isOpen, initialData]);

  const resetForm = () => {
    setFormData({
      legalName: '',
      tradeName: '',
      email: '',
      mobile: '',
      address: '',
      dob: '',
      status: 'Active',
      gstProfile: {
        gstin: '',
        pan: '',
        username: '',
        password: '',
        gstStatus: 'Active',
        regDate: '',
        cancelDate: '',
        regType: 'Regular',
        filingFreq: 'Monthly',
        constitution: 'Proprietorship',
        dob: '',
        stakeholders: [createStakeholder()],
        accountantName: '',
        accountantMobile: '',
        address: '',
        jurisdictionType: 'State',
        sector: '',
        range: '',
        ewayBillId: '',
        ewayBillPass: '',
        gstatId: '',
        gstatPass: ''
      },
      bankDetails: { bankName: '', accountNo: '', ifsc: '' },
      remarks: ''
    });
    setError(null);
    setIsDataLinked(false);
    setLinkedClientName('');
  };

  // State detection helper
  const detectedState = useMemo(() => {
    const gstin = formData.gstProfile?.gstin || '';
    if (gstin.length >= 2) {
      const code = gstin.substring(0, 2);
      return GST_STATE_MAP[code] ? `${GST_STATE_MAP[code]} (${code})` : null;
    }
    return null;
  }, [formData.gstProfile?.gstin]);

  // AUTO-FETCH & AUTO-SYNC LOGIC

  // 1. When GSTIN changes: extract PAN, auto-fill stakeholder PAN & check existing clients
  const handleGstinChange = (val: string) => {
    const gstin = val.trim().toUpperCase().slice(0, 15);
    let extractedPan = '';
    if (gstin.length >= 12) {
      extractedPan = gstin.substring(2, 12);
    }

    setFormData(prev => {
      const prevProfile = prev.gstProfile!;
      const currentPan = extractedPan || prevProfile.pan || '';
      const constitution = prevProfile.constitution || 'Proprietorship';

      // Auto-sync extracted PAN into Stakeholder 1 if Proprietorship or if stakeholder PAN was empty / matching previous PAN
      const currentStakeholders = prevProfile.stakeholders && prevProfile.stakeholders.length > 0
        ? [...prevProfile.stakeholders]
        : [createStakeholder()];

      if (extractedPan && (constitution === 'Proprietorship' || !currentStakeholders[0].pan || currentStakeholders[0].pan === prevProfile.pan)) {
        currentStakeholders[0] = {
          ...currentStakeholders[0],
          pan: extractedPan
        };
      }

      return {
        ...prev,
        gstProfile: {
          ...prevProfile,
          gstin,
          pan: currentPan,
          stakeholders: currentStakeholders
        }
      };
    });

    // Check against existing clients in database
    if (!initialData && extractedPan.length === 10) {
      const match = existingClients.find(c => 
        (c.itProfile?.pan === extractedPan || c.gstProfile?.pan === extractedPan || c.gstProfile?.gstin?.substring(2, 12) === extractedPan)
      );
      if (match) {
        const fetchedDob = match.dob || match.itProfile?.dob || match.gstProfile?.dob || '';
        const mappedConstitution: ConstitutionType = match.gstProfile?.constitution || (
          match.itProfile?.category === 'Firm' ? 'Partnership' :
          match.itProfile?.category === 'Company' ? 'Company' :
          match.itProfile?.category === 'HUF' ? 'HUF' :
          match.itProfile?.category === 'Trust' ? 'Trust' : 'Proprietorship'
        );

        setFormData(prev => {
          const matchedStakeholder = match.gstProfile?.stakeholders?.[0] || (match as any).itProfile?.stakeholders?.[0];
          const curStakeholders = prev.gstProfile?.stakeholders && prev.gstProfile.stakeholders.length > 0
            ? [...prev.gstProfile.stakeholders]
            : [createStakeholder()];

          curStakeholders[0] = {
            ...curStakeholders[0],
            name: curStakeholders[0].name || match.legalName || match.tradeName || matchedStakeholder?.name || '',
            pan: extractedPan,
            mobile: curStakeholders[0].mobile || match.mobile || matchedStakeholder?.mobile || '',
            email: curStakeholders[0].email || match.email || matchedStakeholder?.email || '',
          };

          return {
            ...prev,
            id: match.id,
            legalName: match.legalName || prev.legalName || match.tradeName,
            tradeName: match.tradeName || prev.tradeName || match.legalName,
            mobile: match.mobile || prev.mobile,
            email: match.email || prev.email,
            address: match.address || prev.address,
            dob: fetchedDob || prev.dob,
            status: match.status || prev.status,
            bankDetails: match.bankDetails || prev.bankDetails,
            remarks: match.remarks || prev.remarks,
            gstProfile: {
              ...prev.gstProfile!,
              ...(match.gstProfile || {}),
              gstin,
              pan: extractedPan,
              constitution: mappedConstitution,
              dob: fetchedDob || prev.gstProfile?.dob,
              stakeholders: curStakeholders
            }
          };
        });
        setIsDataLinked(true);
        setLinkedClientName(match.tradeName || match.legalName || 'Database Record');
        toast.info("Existing client found! Details auto-filled from database.");
      } else {
        setIsDataLinked(false);
      }
    }
  };

  // 2. Direct PAN input handler (syncs to Stakeholder 1)
  const handlePanChange = (val: string) => {
    const pan = val.trim().toUpperCase().slice(0, 10);
    setFormData(prev => {
      const prevProfile = prev.gstProfile!;
      const constitution = prevProfile.constitution || 'Proprietorship';
      const curStakeholders = prevProfile.stakeholders && prevProfile.stakeholders.length > 0
        ? [...prevProfile.stakeholders]
        : [createStakeholder()];

      if (constitution === 'Proprietorship' || !curStakeholders[0].pan || curStakeholders[0].pan === prevProfile.pan) {
        curStakeholders[0] = {
          ...curStakeholders[0],
          pan
        };
      }

      return {
        ...prev,
        gstProfile: {
          ...prevProfile,
          pan,
          stakeholders: curStakeholders
        }
      };
    });

    // Check existing clients by PAN
    if (!initialData && pan.length === 10) {
      const match = existingClients.find(c => 
        (c.itProfile?.pan === pan || c.gstProfile?.pan === pan || c.gstProfile?.gstin?.substring(2, 12) === pan)
      );
      if (match) {
        const fetchedDob = match.dob || match.itProfile?.dob || match.gstProfile?.dob || '';
        const mappedConstitution: ConstitutionType = match.gstProfile?.constitution || (
          match.itProfile?.category === 'Firm' ? 'Partnership' :
          match.itProfile?.category === 'Company' ? 'Company' :
          match.itProfile?.category === 'HUF' ? 'HUF' :
          match.itProfile?.category === 'Trust' ? 'Trust' : 'Proprietorship'
        );

        setFormData(prev => {
          const prevProfile = prev.gstProfile!;
          const curStakeholders = prevProfile.stakeholders && prevProfile.stakeholders.length > 0
            ? [...prevProfile.stakeholders]
            : [createStakeholder()];

          curStakeholders[0] = {
            ...curStakeholders[0],
            name: curStakeholders[0].name || match.legalName || match.tradeName || '',
            pan,
            mobile: curStakeholders[0].mobile || match.mobile || '',
            email: curStakeholders[0].email || match.email || '',
          };

          return {
            ...prev,
            id: match.id,
            legalName: match.legalName || prev.legalName || match.tradeName,
            tradeName: match.tradeName || prev.tradeName || match.legalName,
            mobile: match.mobile || prev.mobile,
            email: match.email || prev.email,
            address: match.address || prev.address,
            dob: fetchedDob || prev.dob,
            status: match.status || prev.status,
            bankDetails: match.bankDetails || prev.bankDetails,
            remarks: match.remarks || prev.remarks,
            gstProfile: {
              ...prevProfile,
              ...(match.gstProfile || {}),
              pan,
              constitution: mappedConstitution,
              dob: fetchedDob || prevProfile.dob,
              stakeholders: curStakeholders
            }
          };
        });
        setIsDataLinked(true);
        setLinkedClientName(match.tradeName || match.legalName || 'Database Record');
        toast.info("Existing client details auto-filled by PAN!");
      }
    }
  };

  // 3. Primary Mobile input handler (auto-syncs to Stakeholder 1)
  const handlePrimaryMobileChange = (val: string) => {
    const mobile = val.replace(/\D/g, '').slice(0, 10);
    setFormData(prev => {
      const prevProfile = prev.gstProfile!;
      const constitution = prevProfile.constitution || 'Proprietorship';
      const curStakeholders = prevProfile.stakeholders && prevProfile.stakeholders.length > 0
        ? [...prevProfile.stakeholders]
        : [createStakeholder()];

      // Auto-sync to primary stakeholder
      if (constitution === 'Proprietorship' || !curStakeholders[0].mobile || curStakeholders[0].mobile === prev.mobile) {
        curStakeholders[0] = {
          ...curStakeholders[0],
          mobile
        };
      }

      return {
        ...prev,
        mobile,
        gstProfile: {
          ...prevProfile,
          stakeholders: curStakeholders
        }
      };
    });
  };

  // 4. Primary Email input handler (auto-syncs to Stakeholder 1)
  const handlePrimaryEmailChange = (val: string) => {
    const email = val.trim();
    setFormData(prev => {
      const prevProfile = prev.gstProfile!;
      const constitution = prevProfile.constitution || 'Proprietorship';
      const curStakeholders = prevProfile.stakeholders && prevProfile.stakeholders.length > 0
        ? [...prevProfile.stakeholders]
        : [createStakeholder()];

      if (constitution === 'Proprietorship' || !curStakeholders[0].email || curStakeholders[0].email === prev.email) {
        curStakeholders[0] = {
          ...curStakeholders[0],
          email
        };
      }

      return {
        ...prev,
        email,
        gstProfile: {
          ...prevProfile,
          stakeholders: curStakeholders
        }
      };
    });
  };

  // 5. Stakeholder field handlers (with reverse-sync to primary fields if empty)
  const handleStakeholderFieldChange = (idx: number, field: keyof Stakeholder, value: string) => {
    setFormData(prev => {
      const prevProfile = prev.gstProfile!;
      const curStakeholders = [...(prevProfile.stakeholders || [createStakeholder()])];
      curStakeholders[idx] = {
        ...curStakeholders[idx],
        [field]: value
      };

      const constitution = prevProfile.constitution || 'Proprietorship';
      const updatedClient: Partial<Client> = {
        ...prev,
        gstProfile: {
          ...prevProfile,
          stakeholders: curStakeholders
        }
      };

      // In Proprietorship: Stakeholder #1 is the Proprietor whose name is always the Legal Name
      if (idx === 0 && field === 'name' && constitution === 'Proprietorship') {
        updatedClient.legalName = value;
      }

      // Reverse sync if primary field is blank and index is 0
      if (idx === 0) {
        if (field === 'mobile' && !prev.mobile && value) {
          updatedClient.mobile = value;
        }
        if (field === 'email' && !prev.email && value) {
          updatedClient.email = value;
        }
        if (field === 'pan' && !prevProfile.pan && value) {
          updatedClient.gstProfile!.pan = value;
        }
      }

      return updatedClient;
    });
  };

  // Trade Name change handler:
  // If Proprietorship: Trade Name (Shop/Firm brand) is independent
  // If other (Partnership, Company, HUF, etc.): Legal Name and Trade Name are identical
  const handleTradeNameChange = (val: string) => {
    setFormData(prev => {
      const constitution = prev.gstProfile?.constitution || 'Proprietorship';
      if (constitution === 'Proprietorship') {
        return {
          ...prev,
          tradeName: val
        };
      } else {
        return {
          ...prev,
          tradeName: val,
          legalName: val
        };
      }
    });
  };

  // Legal Name change handler:
  // If Proprietorship: Legal Name is the Proprietor's Name as per PAN (auto-syncs to Stakeholder 1)
  // If other: Legal Name and Trade Name are identical (auto-syncs to Trade Name)
  const handleLegalNameChange = (val: string) => {
    setFormData(prev => {
      const prevProfile = prev.gstProfile!;
      const constitution = prevProfile.constitution || 'Proprietorship';
      const curStakeholders = prevProfile.stakeholders && prevProfile.stakeholders.length > 0
        ? [...prevProfile.stakeholders]
        : [createStakeholder()];

      if (constitution === 'Proprietorship') {
        curStakeholders[0] = {
          ...curStakeholders[0],
          name: val
        };
        return {
          ...prev,
          legalName: val,
          gstProfile: {
            ...prevProfile,
            stakeholders: curStakeholders
          }
        };
      } else {
        return {
          ...prev,
          legalName: val,
          tradeName: val
        };
      }
    });
  };

  // Quick one-click sync for Owner/Stakeholder details
  const autoPickupProprietorInfo = (notify = true) => {
    setFormData(prev => {
      const constitution = prev.gstProfile?.constitution || 'Proprietorship';
      const curStakeholders = prev.gstProfile?.stakeholders && prev.gstProfile.stakeholders.length > 0
        ? [...prev.gstProfile.stakeholders]
        : [createStakeholder()];

      const propName = constitution === 'Proprietorship'
        ? (prev.legalName || curStakeholders[0]?.name || '')
        : (curStakeholders[0]?.name || '');
      const propPan = prev.gstProfile?.pan || '';
      const propMobile = prev.mobile || '';
      const propEmail = prev.email || '';

      curStakeholders[0] = {
        ...curStakeholders[0],
        name: curStakeholders[0].name || propName,
        pan: curStakeholders[0].pan || propPan,
        mobile: curStakeholders[0].mobile || propMobile,
        email: curStakeholders[0].email || propEmail,
      };

      if (notify) {
        const role = getStakeholderCardTitle(constitution, 0);
        toast.success(`${role} details synced with primary info & PAN!`);
      }

      return {
        ...prev,
        legalName: constitution === 'Proprietorship' ? (propName || prev.legalName) : prev.legalName,
        gstProfile: {
          ...prev.gstProfile!,
          stakeholders: curStakeholders
        }
      };
    });
  };

  // Constitution change handler
  const handleConstitutionChange = (newConstitution: ConstitutionType) => {
    setFormData(prev => {
      const updatedProfile = { ...prev.gstProfile!, constitution: newConstitution };
      const curStakeholders = updatedProfile.stakeholders && updatedProfile.stakeholders.length > 0
        ? [...updatedProfile.stakeholders]
        : [createStakeholder()];

      let newLegalName = prev.legalName || '';
      let newTradeName = prev.tradeName || '';

      if (newConstitution === 'Proprietorship') {
        // In Proprietorship: Legal Name = Proprietor Name
        const propName = newLegalName || curStakeholders[0]?.name || '';
        newLegalName = propName;
        curStakeholders[0] = {
          ...curStakeholders[0],
          name: propName,
          pan: curStakeholders[0].pan || prev.gstProfile?.pan || '',
          mobile: curStakeholders[0].mobile || prev.mobile || '',
          email: curStakeholders[0].email || prev.email || '',
        };
      } else {
        // In Partnership, Company, HUF, Trust, Society: Trade Name and Legal Name are identical
        const commonName = newTradeName || newLegalName || '';
        newLegalName = commonName;
        newTradeName = commonName;
      }

      updatedProfile.stakeholders = curStakeholders;

      return {
        ...prev,
        legalName: newLegalName,
        tradeName: newTradeName,
        gstProfile: updatedProfile
      };
    });
  };

  const handleRegTypeChange = (type: GstRegType) => {
    setFormData(prev => ({
      ...prev,
      gstProfile: {
        ...prev.gstProfile!,
        regType: type,
        filingFreq: type === 'Composition' ? 'Quarterly' : prev.gstProfile?.filingFreq || 'Monthly'
      }
    }));
  };

  const handleTabClick = (stepId: number) => {
    setActiveTabStep(stepId);
    if (stepId === 3 && (formData.gstProfile?.constitution || 'Proprietorship') === 'Proprietorship') {
      autoPickupProprietorInfo(false);
    }
  };

  const addStakeholder = () => {
    setFormData(prev => ({
      ...prev,
      gstProfile: {
        ...prev.gstProfile!,
        stakeholders: [...(prev.gstProfile!.stakeholders || []), createStakeholder()]
      }
    }));
  };

  const removeStakeholder = (id: string) => {
    setFormData(prev => ({
      ...prev,
      gstProfile: {
        ...prev.gstProfile!,
        stakeholders: prev.gstProfile!.stakeholders.filter(s => s.id !== id)
      }
    }));
  };

  const getStakeholderSectionTitle = (constitution: ConstitutionType = 'Proprietorship') => {
    switch (constitution) {
      case 'Proprietorship': return 'Proprietor Details (Owner)';
      case 'Partnership': return 'Partner Details';
      case 'Company': return 'Director Details';
      case 'HUF': return 'Karta & Member Details';
      case 'Trust': return 'Trustee Details';
      case 'Society': return 'Executive Committee / Member Details';
      default: return 'Stakeholder / Member Details';
    }
  };

  const getStakeholderCardTitle = (constitution: ConstitutionType = 'Proprietorship', index: number = 0) => {
    switch (constitution) {
      case 'Proprietorship': return 'Proprietor (Sole Owner)';
      case 'Partnership': return `Partner #${index + 1}${index === 0 ? ' (Managing / Primary Partner)' : ''}`;
      case 'Company': return `Director #${index + 1}${index === 0 ? ' (Managing Director)' : ''}`;
      case 'HUF': return index === 0 ? 'Karta (Head of Family)' : `Member #${index + 1}`;
      case 'Trust': return `Trustee #${index + 1}${index === 0 ? ' (Managing Trustee)' : ''}`;
      case 'Society': return `Member #${index + 1}${index === 0 ? ' (President / Secretary)' : ''}`;
      default: return `Member #${index + 1}`;
    }
  };

  const getStakeholderNameLabel = (constitution: ConstitutionType = 'Proprietorship', index: number = 0) => {
    switch (constitution) {
      case 'Proprietorship': return 'Proprietor Full Name (Legal Name as per PAN)';
      case 'Partnership': return 'Partner Full Name (As per PAN)';
      case 'Company': return 'Director Full Name (As per DIN / PAN)';
      case 'HUF': return index === 0 ? 'Karta Full Name (As per PAN)' : 'Family Member Full Name';
      case 'Trust': return 'Trustee Full Name';
      case 'Society': return 'Member Full Name';
      default: return 'Full Name';
    }
  };

  const getAddStakeholderBtnLabel = (constitution: ConstitutionType = 'Proprietorship') => {
    switch (constitution) {
      case 'Partnership': return '+ Add Partner';
      case 'Company': return '+ Add Director';
      case 'HUF': return '+ Add Member';
      case 'Trust': return '+ Add Trustee';
      case 'Society': return '+ Add Member';
      default: return '+ Add Member';
    }
  };

  const getStakeholderLabel = (constitution: ConstitutionType = 'Proprietorship') => {
    switch (constitution) {
      case 'Proprietorship': return 'Proprietor (Owner)';
      case 'Partnership': return 'Partner';
      case 'HUF': return 'Karta / Member';
      case 'Company': return 'Director';
      case 'Trust': return 'Trustee';
      case 'Society': return 'Member';
      default: return 'Stakeholder';
    }
  };

  const handleSave = () => {
    setError(null);
    if (!formData.tradeName?.trim() && !formData.legalName?.trim()) {
      return setError("Please enter the Business Name or Legal Name.");
    }
    if (!formData.gstProfile?.gstin?.trim()) {
      return setError("Please enter the 15-digit GSTIN number.");
    }
    if (formData.gstProfile.gstin.trim().length !== 15) {
      return setError("GSTIN must be exactly 15 characters.");
    }

    const constitution = formData.gstProfile?.constitution || 'Proprietorship';
    const payload = { ...formData };
    if (formData.dob) {
      payload.dob = formData.dob;
      if (payload.gstProfile) {
        payload.gstProfile.dob = formData.dob;
      }
    } else if (payload.gstProfile?.dob) {
      payload.dob = payload.gstProfile.dob;
    }

    if (constitution === 'Proprietorship') {
      const propName = payload.legalName || payload.gstProfile?.stakeholders?.[0]?.name || '';
      payload.legalName = propName;
      if (payload.gstProfile?.stakeholders && payload.gstProfile.stakeholders.length > 0) {
        payload.gstProfile.stakeholders[0].name = propName;
      }
    } else {
      const common = payload.tradeName || payload.legalName || '';
      payload.tradeName = common;
      payload.legalName = common;
    }
    
    saveMutation.mutate(payload);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-5 overflow-hidden animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200 dark:border-slate-800 transition-all font-sans"
      >
        
        {/* Modal Header */}
        <header className="px-4 sm:px-6 md:px-8 py-3.5 sm:py-4 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between shrink-0 border-b border-slate-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3.5 relative z-10 min-w-0">
             <div className="h-10 w-10 md:h-11 md:w-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-600/30 shrink-0">
                GST
             </div>
             <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base md:text-lg font-bold tracking-tight text-white truncate">
                    {initialData 
                      ? (formData.tradeName || formData.legalName || 'Edit GST Client Profile') 
                      : 'Add New GST Client'}
                  </h2>
                  {initialData && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        formData.status === 'Active' 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {formData.status || 'Active'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[9px] font-bold uppercase tracking-wider">
                        {formData.gstProfile?.constitution || 'Proprietorship'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-indigo-300 font-medium truncate">
                  {initialData ? (
                    <span className="font-mono text-[11px] text-slate-400">
                      {formData.gstProfile?.gstin ? `GSTIN: ${formData.gstProfile.gstin}` : 'No GSTIN'} • {formData.legalName || '---'}
                    </span>
                  ) : (
                    <span>{isDataLinked ? `✨ Auto-filled from ${linkedClientName}` : 'Enter GST details, owner info, and portal credentials'}</span>
                  )}
                </div>
             </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer relative z-10 shrink-0 ml-2 active:scale-95 shadow-2xs"
            title="Close (Esc)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Tab Header Steps */}
        <div className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          {FORM_TABS.map(tab => {
            const isActive = activeTabStep === tab.id;
            let tabLabel = tab.name;
            if (tab.id === 3) {
              const constn = formData.gstProfile?.constitution || 'Proprietorship';
              if (constn === 'Proprietorship') tabLabel = '3. Proprietor (Owner)';
              else if (constn === 'Partnership') tabLabel = '3. Partners';
              else if (constn === 'Company') tabLabel = '3. Directors';
              else if (constn === 'HUF') tabLabel = '3. Karta & Members';
              else if (constn === 'Trust') tabLabel = '3. Trustees';
              else if (constn === 'Society') tabLabel = '3. Members';
            }
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tabLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Progress Bar Indicator */}
        <div className="h-1 w-full bg-slate-100 dark:bg-slate-800">
          <div 
            className="h-full bg-indigo-600 transition-all duration-300 ease-out" 
            style={{ width: `${(activeTabStep / 4) * 100}%` }}
          />
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 md:p-8 space-y-6">
          
          {/* Error Banner */}
          {error && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-2 animate-in fade-in">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Auto-Linked Client Banner */}
          {isDataLinked && (
            <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-2xl text-xs font-medium text-indigo-700 dark:text-indigo-300 flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-2">
                <span>✨</span>
                <span><strong>Existing Client Found:</strong> Contact details, PAN, and banking information were auto-filled from <strong>{linkedClientName}</strong>.</span>
              </div>
              <button 
                type="button" 
                onClick={() => setIsDataLinked(false)} 
                className="text-[10px] text-indigo-500 hover:underline font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* STEP 1: BASIC DETAILS & LOGIN */}
          {activeTabStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Business Name & Status */}
              <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 p-5 space-y-4">
                <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <span>🏢</span> Business Information
                </h3>
                
                {/* Row 1: Constitution, Trade Name, Legal Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate" title="Constitution of Business">
                        Constitution of Business
                      </label>
                    </div>
                    <select 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.gstProfile?.constitution || 'Proprietorship'} 
                      onChange={e => handleConstitutionChange(e.target.value as ConstitutionType)}
                    >
                      <option value="Proprietorship">Proprietorship (Single Owner)</option>
                      <option value="Partnership">Partnership Firm / LLP</option>
                      <option value="Company">Private / Public Limited Company</option>
                      <option value="HUF">Hindu Undivided Family (HUF)</option>
                      <option value="Trust">Trust</option>
                      <option value="Society">Society</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate" title="Trade Name">
                        Trade Name (Business Name) <span className="text-rose-500">*</span>
                      </label>
                      {formData.gstProfile?.constitution !== 'Proprietorship' && (
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold shrink-0">
                          = Legal Name
                        </span>
                      )}
                    </div>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                      value={formData.tradeName || ''} 
                      onChange={e => handleTradeNameChange(e.target.value)} 
                      placeholder={formData.gstProfile?.constitution === 'Proprietorship' ? "e.g. Acme Traders" : "e.g. Acme Enterprises Pvt Ltd"} 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate" title={formData.gstProfile?.constitution === 'Proprietorship' ? 'Legal Name (Proprietor Name)' : 'Legal Name (As per PAN)'}>
                        {formData.gstProfile?.constitution === 'Proprietorship' ? 'Legal Name (Proprietor Name)' : 'Legal Name (As per PAN)'}
                      </label>
                      {formData.gstProfile?.constitution === 'Proprietorship' ? (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                          = Proprietor
                        </span>
                      ) : (
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold shrink-0">
                          = Trade Name
                        </span>
                      )}
                    </div>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                      value={formData.legalName || ''} 
                      onChange={e => handleLegalNameChange(e.target.value)} 
                      placeholder={formData.gstProfile?.constitution === 'Proprietorship' ? "e.g. Ramesh Kumar Sharma" : "e.g. Acme Enterprises Pvt Ltd"} 
                    />
                  </div>
                </div>

                {/* Row 2: Date of Birth / Incorporation & Client Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4 pt-1">
                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate" title="Date of Birth / Incorporation Date">
                        Date of Birth / Incorporation (DOB / DOI)
                      </label>
                    </div>
                    <input 
                      type="date"
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 uppercase outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.dob || formData.gstProfile?.dob || ''} 
                      onChange={e => {
                        const val = e.target.value;
                        setFormData(prev => ({
                          ...prev,
                          dob: val,
                          gstProfile: {
                            ...prev.gstProfile!,
                            dob: val
                          }
                        }));
                      }} 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Client Status
                      </label>
                    </div>
                    <select 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.status} 
                      onChange={e => setFormData({...formData, status: e.target.value as ClientStatus})}
                    >
                      <option value="Active">Active</option>
                      <option value="Litigation">Under Notice / Dispute</option>
                      <option value="Inactive">Inactive / Suspended</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* GST Number & Portal Credentials */}
              <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                    <span>🔐</span> GST Number & Portal Login
                  </h3>
                  {detectedState && (
                    <span className="text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                      📍 {detectedState}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex flex-col justify-end space-y-1.5 sm:col-span-2 md:col-span-1">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        GSTIN (15 Digits) <span className="text-rose-500">*</span>
                      </label>
                    </div>
                    <input 
                      className="w-full h-10 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 px-3.5 py-2 rounded-xl font-mono font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20" 
                      value={formData.gstProfile?.gstin || ''} 
                      onChange={e => handleGstinChange(e.target.value)} 
                      placeholder="27AAAAA0000A1Z5" 
                      maxLength={15}
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        PAN Number
                      </label>
                      {formData.gstProfile?.pan && formData.gstProfile?.gstin?.length === 15 && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                          ✓ GSTIN
                        </span>
                      )}
                    </div>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl font-mono font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20" 
                      value={formData.gstProfile?.pan || ''} 
                      onChange={e => handlePanChange(e.target.value)}
                      placeholder="e.g. ABCDE1234F" 
                      maxLength={10}
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        GST Portal Username
                      </label>
                    </div>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl font-medium text-slate-900 dark:text-slate-100 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.gstProfile?.username || ''} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, username: e.target.value}})} 
                      placeholder="e.g. acme_gst" 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        GST Portal Password
                      </label>
                    </div>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl font-medium text-slate-900 dark:text-slate-100 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 pr-9" 
                        value={formData.gstProfile?.password || ''} 
                        onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, password: e.target.value}})} 
                        placeholder="••••••••" 
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)} 
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1 cursor-pointer"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Contact Info */}
              <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                    <span>📞</span> Primary Contact Details
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Auto-syncs with Owner/Stakeholder contact
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Phone / Mobile Number
                      </label>
                      {formData.mobile && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                          ✓ Synced
                        </span>
                      )}
                    </div>
                    <input 
                      type="tel"
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl font-mono font-medium text-slate-900 dark:text-slate-100 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.mobile || ''} 
                      onChange={e => handlePrimaryMobileChange(e.target.value)} 
                      placeholder="10-digit mobile number" 
                      maxLength={10}
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Email Address
                      </label>
                    </div>
                    <input 
                      type="email" 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl font-medium text-slate-900 dark:text-slate-100 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.email || ''} 
                      onChange={e => handlePrimaryEmailChange(e.target.value)} 
                      placeholder="client@company.com" 
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5 sm:col-span-2 md:col-span-1">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Business Address
                      </label>
                    </div>
                    <input 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl font-medium text-slate-900 dark:text-slate-100 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.address || ''} 
                      onChange={e => setFormData({...formData, address: e.target.value})} 
                      placeholder="Shop / Office address" 
                    />
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* STEP 2: CONTACT & GST INFO */}
          {activeTabStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Business Scheme & Filing Settings */}
              <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 p-5 space-y-4">
                <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <span>🏛️</span> Business Type & Filing Schedule
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        GST Scheme
                      </label>
                    </div>
                    <select 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.gstProfile?.regType} 
                      onChange={e => handleRegTypeChange(e.target.value as GstRegType)}
                    >
                      <option value="Regular">Regular Taxpayer</option>
                      <option value="Composition">Composition Scheme</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Return Filing Frequency
                      </label>
                    </div>
                    <select 
                      disabled={formData.gstProfile?.regType === 'Composition'} 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50" 
                      value={formData.gstProfile?.filingFreq} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, filingFreq: e.target.value as GstFilingFreq}})}
                    >
                      <option value="Monthly">Monthly</option>
                      <option value="Quarterly">Quarterly (QRMP)</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5">
                    <div className="h-6 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        GST Registration Status
                      </label>
                    </div>
                    <select 
                      className="w-full h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.gstProfile?.gstStatus} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, gstStatus: e.target.value as GstStatus}})}
                    >
                      <option value="Active">Active</option>
                      <option value="Suspended">Suspended</option>
                      <option value="Closed">Cancelled</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Registration Date
                    </label>
                    <input 
                      type="date" 
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase" 
                      value={formData.gstProfile?.regDate || ''} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, regDate: e.target.value}})} 
                    />
                  </div>

                  {(formData.gstProfile?.gstStatus === 'Closed' || (formData.gstProfile?.gstStatus as string) === 'Cancelled' || formData.gstProfile?.gstStatus === 'Suspended') && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                        {formData.gstProfile?.gstStatus === 'Suspended' ? 'Suspension Date' : 'Cancellation Date'}
                      </label>
                      <input 
                        type="date" 
                        className="w-full bg-rose-50/60 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-3.5 py-2.5 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-300 outline-none uppercase" 
                        value={formData.gstProfile?.cancelDate || ''} 
                        onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, cancelDate: e.target.value}})} 
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Tax Authority Jurisdiction
                    </label>
                    <select 
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.gstProfile?.jurisdictionType} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, jurisdictionType: e.target.value as JurisdictionType}})}
                    >
                      <option value="State">State Jurisdiction</option>
                      <option value="Center">Central Jurisdiction</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Sector / Ward
                    </label>
                    <input 
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.gstProfile?.sector || ''} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, sector: e.target.value}})} 
                      placeholder="e.g. Ward 4" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Range / Circle
                    </label>
                    <input 
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.gstProfile?.range || ''} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, range: e.target.value}})} 
                      placeholder="e.g. Range I" 
                    />
                  </div>
                </div>
              </div>

              {/* Form GST REG-06 Certificate Upload */}
              <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-5 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">📜</span>
                    <div>
                      <h3 className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                        GST Registration Certificate (Form GST REG-06)
                      </h3>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                        Attach official Govt REG-06 Certificate PDF or image for instant client sharing.
                      </p>
                    </div>
                  </div>
                  {formData.gstProfile?.gstCertificate && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200">
                      Attached
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                  <label className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2 shadow-sm">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>{formData.gstProfile?.gstCertificate ? 'Replace Certificate' : 'Upload REG-06 PDF / Image'}</span>
                    <input 
                      type="file" 
                      accept=".pdf,image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          const base64 = evt.target?.result as string;
                          setFormData(prev => ({
                            ...prev,
                            gstProfile: {
                              ...prev.gstProfile!,
                              gstCertificate: base64,
                              gstCertificateName: file.name
                            }
                          }));
                          toast.success(`Attached ${file.name}`);
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>

                  {formData.gstProfile?.gstCertificate && (
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                      <span className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 truncate max-w-[220px]" title={formData.gstProfile.gstCertificateName}>
                        📎 {formData.gstProfile.gstCertificateName || 'GST_Certificate.pdf'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            gstProfile: {
                              ...prev.gstProfile!,
                              gstCertificate: undefined,
                              gstCertificateName: undefined
                            }
                          }));
                          toast.info('Removed Certificate attachment');
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50 text-xs font-semibold transition-colors"
                        title="Remove attachment"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* STEP 3: OWNER & STAKEHOLDERS */}
          {activeTabStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Assigned Accountant */}
              <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 p-5 space-y-4">
                <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <span>💼</span> Accountant / Staff In-Charge (Optional)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Accountant Name</label>
                    <input 
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.gstProfile?.accountantName || ''} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, accountantName: e.target.value}})} 
                      placeholder="e.g. Suresh Patil" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Accountant Mobile</label>
                    <input 
                      type="tel"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.gstProfile?.accountantMobile || ''} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, accountantMobile: e.target.value.replace(/\D/g, '').slice(0, 10)}})} 
                      placeholder="10-digit mobile number" 
                      maxLength={10}
                    />
                  </div>
                </div>
              </div>

              {/* Stakeholders List */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                      <span>👤</span> {getStakeholderSectionTitle(formData.gstProfile?.constitution)}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {formData.gstProfile?.constitution === 'Proprietorship'
                        ? 'For Proprietorship, the Proprietor’s personal name is the Legal Name. Auto-synced with PAN and Primary Phone.'
                        : 'Enter details for all partners, directors, or karta/members. Changes sync with primary contact details.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button" 
                      onClick={() => autoPickupProprietorInfo(true)} 
                      className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 shadow-sm"
                      title="Auto-fill from Primary Info, PAN, Mobile & Email"
                    >
                      <span>⚡</span> Sync with Primary Info
                    </button>
                    {formData.gstProfile?.constitution !== 'Proprietorship' && (
                      <button 
                        type="button" 
                        onClick={addStakeholder} 
                        className="px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors border border-indigo-200 dark:border-indigo-800"
                      >
                        {getAddStakeholderBtnLabel(formData.gstProfile?.constitution)}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {(!formData.gstProfile?.stakeholders || formData.gstProfile.stakeholders.length === 0) ? (
                    <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        No {formData.gstProfile?.constitution === 'Proprietorship' ? 'proprietor' : 'partner / director'} information added yet.
                      </p>
                      <button
                        type="button"
                        onClick={addStakeholder}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                      >
                        {formData.gstProfile?.constitution === 'Proprietorship' ? '+ Add Proprietor' : getAddStakeholderBtnLabel(formData.gstProfile?.constitution)}
                      </button>
                    </div>
                  ) : (
                    formData.gstProfile.stakeholders.map((s, idx) => (
                      <div key={s.id || idx} className="bg-slate-50/80 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              {getStakeholderCardTitle(formData.gstProfile?.constitution, idx)}
                            </span>
                            {idx === 0 && (
                              <span className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                                {formData.gstProfile?.constitution === 'Proprietorship' ? 'Sole Owner' : 'Primary Contact'}
                              </span>
                            )}
                          </div>
                          {formData.gstProfile?.constitution !== 'Proprietorship' && formData.gstProfile!.stakeholders.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => removeStakeholder(s.id)} 
                              className="text-rose-500 hover:text-rose-600 text-xs font-semibold hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {getStakeholderNameLabel(formData.gstProfile?.constitution, idx)}
                              </label>
                              {formData.gstProfile?.constitution === 'Proprietorship' && idx === 0 && s.name && s.name === formData.legalName && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                  ✓ Legal Name
                                </span>
                              )}
                            </div>
                            <input 
                              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                              value={s.name || ''} 
                              onChange={e => handleStakeholderFieldChange(idx, 'name', e.target.value)} 
                              placeholder={formData.gstProfile?.constitution === 'Proprietorship' ? "Proprietor Full Name" : "Partner / Director Full Name"} 
                            />
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Mobile Number</label>
                              {s.mobile && s.mobile === formData.mobile && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                  ✓ Synced
                                </span>
                              )}
                            </div>
                            <input 
                              type="tel"
                              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-xs font-mono font-medium text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                              value={s.mobile || ''} 
                              onChange={e => handleStakeholderFieldChange(idx, 'mobile', e.target.value.replace(/\D/g, '').slice(0, 10))} 
                              placeholder="10-digit mobile" 
                              maxLength={10}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">PAN Number</label>
                              {s.pan && s.pan === formData.gstProfile?.pan && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                  ✓ Synced
                                </span>
                              )}
                            </div>
                            <input 
                              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-xs font-mono font-bold uppercase text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                              value={s.pan || ''} 
                              onChange={e => handleStakeholderFieldChange(idx, 'pan', e.target.value.toUpperCase().slice(0, 10))} 
                              placeholder="e.g. ABCDE1234F" 
                              maxLength={10}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email Address</label>
                            <input 
                              type="email"
                              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 lowercase" 
                              value={s.email || ''} 
                              onChange={e => handleStakeholderFieldChange(idx, 'email', e.target.value)} 
                              placeholder="email@example.com" 
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* STEP 4: BANK, PORTALS & NOTES */}
          {activeTabStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Bank Account Details */}
              <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 p-5 space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                    <span>🏦</span> Bank Account Details (For GST Refunds)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Account used for GST return validation and direct tax refunds.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Bank Name</label>
                    <input 
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.bankDetails?.bankName || ''} 
                      onChange={e => setFormData({...formData, bankDetails: {...formData.bankDetails!, bankName: e.target.value}})} 
                      placeholder="e.g. State Bank of India" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Account Number</label>
                    <input 
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.bankDetails?.accountNo || ''} 
                      onChange={e => setFormData({...formData, bankDetails: {...formData.bankDetails!, accountNo: e.target.value}})} 
                      placeholder="Account Number" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">IFSC Code</label>
                    <input 
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-mono font-bold uppercase text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      value={formData.bankDetails?.ifsc || ''} 
                      onChange={e => setFormData({...formData, bankDetails: {...formData.bankDetails!, ifsc: e.target.value.toUpperCase()}})} 
                      placeholder="e.g. SBIN0001234" 
                      maxLength={11}
                    />
                  </div>
                </div>
              </div>

              {/* E-Way Bill & GSTAT Portals */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* E-Way Bill */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>🚚</span> E-Way Bill Portal Credentials (Optional)
                  </h3>
                  <div className="space-y-2.5">
                    <input 
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20" 
                      value={formData.gstProfile?.ewayBillId || ''} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, ewayBillId: e.target.value}})} 
                      placeholder="E-Way Bill Username" 
                    />
                    <div className="relative">
                      <input 
                        type={showEwayPass ? "text" : "password"} 
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20 pr-9" 
                        value={formData.gstProfile?.ewayBillPass || ''} 
                        onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, ewayBillPass: e.target.value}})} 
                        placeholder="E-Way Bill Password" 
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowEwayPass(!showEwayPass)} 
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1"
                      >
                        {showEwayPass ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* GSTAT Portal */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>⚖️</span> GSTAT Tribunal Credentials (Optional)
                  </h3>
                  <div className="space-y-2.5">
                    <input 
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20" 
                      value={formData.gstProfile?.gstatId || ''} 
                      onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, gstatId: e.target.value}})} 
                      placeholder="GSTAT User ID" 
                    />
                    <div className="relative">
                      <input 
                        type={showGstatPass ? "text" : "password"} 
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 w-full outline-none focus:ring-2 focus:ring-indigo-500/20 pr-9" 
                        value={formData.gstProfile?.gstatPass || ''} 
                        onChange={e => setFormData({...formData, gstProfile: {...formData.gstProfile!, gstatPass: e.target.value}})} 
                        placeholder="GSTAT Password" 
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowGstatPass(!showGstatPass)} 
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1"
                      >
                        {showGstatPass ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Office Remarks */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notes & Special Instructions (Internal)
                </label>
                <textarea 
                  className="w-full h-24 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 font-normal text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none placeholder:text-slate-400 dark:placeholder:text-slate-500" 
                  value={formData.remarks || ''} 
                  onChange={e => setFormData({...formData, remarks: e.target.value})} 
                  placeholder="Record internal client history, tax consultant notes, or filing instructions..." 
                />
              </div>

            </div>
          )}

        </div>

        {/* Footer Navigation Controls */}
        <footer className="px-6 py-4 md:px-8 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-2">
            {activeTabStep > 1 && (
              <button 
                type="button" 
                onClick={() => setActiveTabStep(prev => prev - 1)} 
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium text-xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                ← Back
              </button>
            )}
            <button 
              type="button" 
              onClick={onClose} 
              className="px-3 py-2 text-slate-500 dark:text-slate-400 font-medium text-xs hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="flex items-center gap-2">
            {initialData && activeTabStep < 4 && (
              <button 
                type="button" 
                onClick={handleSave} 
                disabled={isSaving} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                title="Save changes immediately"
              >
                <span>💾</span>
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            )}

            {activeTabStep < 4 ? (
              <button 
                type="button" 
                onClick={() => setActiveTabStep(prev => prev + 1)} 
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-xs shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Continue</span>
                <span>→</span>
              </button>
            ) : (
              <button 
                type="button" 
                onClick={handleSave} 
                disabled={isSaving} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-6 py-2.5 rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                <span>{isSaving ? 'Saving...' : initialData ? 'Save Changes' : 'Save GST Client'}</span>
              </button>
            )}
          </div>
        </footer>

      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

export default GSTClientFormModal;
