'use client';

import { useState, useEffect } from 'react';
import { AnonAadhaarProof, LogInWithAnonAadhaar, useAnonAadhaar } from '@anon-aadhaar/react';

export default function CheckoutVerificationGate() {
  const [anonAadhaar] = useAnonAadhaar();
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Mock checkout session ID passed from Shopify / E-commerce state
  const checkoutId = "chk_live_98234710923"; 

  useEffect(() => {
    if (anonAadhaar.status === 'logged-in') {
      verifyAndSyncBackend(true);
    }
  }, [anonAadhaar.status]);

  const verifyAndSyncBackend = async (status: boolean) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/zkp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_id: checkoutId, age_verified: status }),
      });
      const data = await res.json();
      if (data.success && data.age_verified) {
        setIsVerified(true);
      }
    } catch (err) {
      console.error('Backend sync failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md space-y-4 border border-gray-100">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900">Age Verification Required</h2>
        <p className="text-sm text-gray-500 mt-1">
          Restricted goods detected. Please verify your age securely via ZeroAssert before selecting your payment method.
        </p>
      </div>

      {!isVerified ? (
        <div className="flex flex-col items-center space-y-3 pt-2">
          <LogInWithAnonAadhaar useTestAadhaar={false} />
          {anonAadhaar.status === 'logged-in' && (
            <p className="text-xs text-indigo-600 font-medium">Processing zero-knowledge proof...</p>
          )}
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 p-3 rounded-lg text-center">
          <p className="text-sm font-semibold text-green-800">✅ Age Verified Successfully (18+)</p>
          <p className="text-xs text-green-600 mt-0.5">Payment gateway unlocked.</p>
        </div>
      )}

      {/* Payment Gateway Gate */}
      <div className={`space-y-2 pt-4 transition-opacity ${isVerified ? 'opacity-100 pointer-events-auto' : 'opacity-40 pointer-events-none'}`}>
        <button className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition">
          Pay via UPI (Instant Intent)
        </button>
        <button className="w-full bg-gray-100 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-200 transition">
          Pay via Credit / Debit Card
        </button>
      </div>
    </div>
  );
}
