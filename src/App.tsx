import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { CatalogSection } from './components/CatalogSection';
import { AppointmentSection } from './components/AppointmentSection';
import { AboutSocialOptics } from './components/AboutSocialOptics';
import { FaqSection } from './components/FaqSection';
import { ContactLocationSection } from './components/ContactLocationSection';
import { ChatWidget } from './components/ChatWidget';
import { TryOnModal } from './components/TryOnModal';
import { Footer } from './components/Footer';
import { FrameItem } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState('hero');
  const [preselectedFrame, setPreselectedFrame] = useState<FrameItem | null>(null);
  const [tryOnFrame, setTryOnFrame] = useState<FrameItem | null>(null);

  const scrollToSection = (sectionId: string) => {
    setActiveTab(sectionId);
    const elem = document.getElementById(sectionId);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectFrameForBooking = (frame: FrameItem) => {
    setPreselectedFrame(frame);
    scrollToSection('booking');
  };

  const handleOpenBookingWithParams = (details: string) => {
    scrollToSection('booking');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-['Assistant',sans-serif]">
      {/* Sticky Top Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenBooking={() => scrollToSection('booking')}
      />

      {/* Main Content Sections */}
      <main className="flex-1">
        {/* Hero Section */}
        <Hero
          onOpenBooking={() => scrollToSection('booking')}
          onNavigateToCatalog={() => scrollToSection('catalog')}
        />

        {/* Appointment Booking & Eye Exams */}
        <AppointmentSection />

        {/* About Social Optics Initiative */}
        <AboutSocialOptics />

        {/* FAQ Section */}
        <FaqSection />

        {/* Contact, Verification & Directions (Waze) */}
        <ContactLocationSection />

        {/* Frames Catalog Section */}
        <CatalogSection
          onSelectFrameForBooking={handleSelectFrameForBooking}
          onOpenTryOn={(frame) => setTryOnFrame(frame)}
        />
      </main>

      {/* Footer */}
      <Footer />

      {/* Dual Web/WhatsApp AI Assistant Chat Widget */}
      <ChatWidget />

      {/* Virtual Try-On Modal */}
      {tryOnFrame && (
        <TryOnModal
          frame={tryOnFrame}
          onClose={() => setTryOnFrame(null)}
          onSelectForBooking={handleSelectFrameForBooking}
        />
      )}
    </div>
  );
}
