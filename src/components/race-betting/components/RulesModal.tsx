'use client';

import React, { useState } from 'react';
import { X, BookOpen, Crown, HelpCircle } from 'lucide-react';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'english' | 'urdu'>('english');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">
              RACE 20-20 — OFFICIAL RULES & GUIDE
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-2 gap-3">
          <button
            onClick={() => setActiveTab('english')}
            className={`pb-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'english'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            English Guide
          </button>
          <button
            onClick={() => setActiveTab('urdu')}
            className={`pb-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'urdu'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Roman Urdu (قواعد)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed scrollbar-thin">
          {activeTab === 'english' ? (
            <>
              <div className="bg-emerald-950/40 border border-emerald-600/40 p-3.5 rounded-xl">
                <div className="flex items-center gap-2 font-black text-emerald-300 mb-1">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>The Core Concept of Race 20-20</span>
                </div>
                <p>
                  Race 20-20 is played with a <strong>48-card deck</strong> (Ace through Queen in all 4 suits).
                  The 4 Kings (<strong>K♠, K♥, K♣, K♦</strong>) are not in the deck — they represent the 4 racers.
                  Cards are dealt from the shoe one by one. The first suit/King to collect <strong>5 cards</strong> in their track wins the race!
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
                  1. Main Winner (Back & Lay)
                </h3>
                <p>
                  Predict which King will complete 5 cards first.
                  <br />
                  • <strong>BACK (Odds 3.75):</strong> You win if your selected King hits 5 cards first.
                  <br />
                  • <strong>LAY (Odds 3.90):</strong> You win if your selected King DOES NOT win.
                </p>

                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
                  2. Color Bet (Red vs Black)
                </h3>
                <p>
                  • <strong>RED:</strong> Wins if Heart ♥ or Diamond ♦ wins the race (Odds: 1.95).
                  <br />
                  • <strong>BLACK:</strong> Wins if Spade ♠ or Club ♣ wins the race (Odds: 1.95).
                </p>

                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
                  3. Total Cards Fancy Market
                </h3>
                <p>
                  The minimum number of cards to finish a race is <strong>5</strong> (if all 5 are the same suit).
                  The maximum is <strong>17</strong> cards (4+4+4+4 = 16, plus 17th is the winning 5th card).
                  <br />
                  • <strong>Over / Under 10.5 Cards</strong> (Odds 1.90)
                  <br />
                  • <strong>Odd / Even Total Cards</strong> (Odds 1.95)
                  <br />
                  • <strong>Card Ranges:</strong> 5 to 8 (4.50), 9 to 12 (1.85), 13 to 17 (3.80).
                </p>

                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
                  4. Total Points Fancy Market
                </h3>
                <p>
                  Points are calculated from the face value of every card dealt until the race ends:
                  <br />
                  • <strong>Ace = 1 point</strong>
                  <br />
                  • <strong>Cards 2 to 10 = Face value</strong> (2 to 10 points)
                  <br />
                  • <strong>Jack = 11 points</strong>
                  <br />
                  • <strong>Queen = 12 points</strong>
                  <br />
                  • Markets: <strong>Over/Under 70.5 points</strong> and <strong>Odd/Even points</strong>.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-amber-950/40 border border-amber-600/40 p-3.5 rounded-xl">
                <div className="flex items-center gap-2 font-black text-amber-300 mb-1">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>Race 20-20 کھیل کا بنیادی اصول</span>
                </div>
                <p>
                  Race 20-20 ایک مشہور کیسینو گیم ہے جس میں کُل <strong>48 تاش کے پتے</strong> (Ace سے Queen تک چاروں سوٹس: ہکم ♠، پان ♥، چڑیا ♣، اینٹ ♦) استعمال ہوتے ہیں۔
                  چاروں بادشاہ (Kings) تاش میں نہیں ہوتے بلکہ وہ ریس ٹریک پر کھڑے ہوتے ہیں۔
                  جو سوٹ سب سے پہلے <strong>5 پتے (cards)</strong> حاصل کر لیتا ہے، وہی King یہ ریس جیت جاتا ہے!
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
                  1. مین ونر بیٹ (Main Winner Back & Lay)
                </h3>
                <p>
                  آپ شرط لگا سکتے ہیں کہ کون سا بادشاہ پہلے 5 پتے حاصل کرے گا۔
                  <br />
                  • <strong>BACK (3.75 Odds):</strong> اگر آپ کا منتخب کردہ سوٹ جیت گیا تو آپ جیت جائیں گے۔
                  <br />
                  • <strong>LAY (3.90 Odds):</strong> اگر آپ کا منتخب کردہ سوٹ نہ جیتے، بلکہ کوئی اور جیتے تو آپ جیت جائیں گے۔
                </p>

                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
                  2. کلر بیٹ (Red vs Black)
                </h3>
                <p>
                  • <strong>RED:</strong> اگر Heart ♥ یا Diamond ♦ جیتے (Odds 1.95)
                  <br />
                  • <strong>BLACK:</strong> اگر Spade ♠ یا Club ♣ جیتے (Odds 1.95)
                </p>

                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
                  3. ٹوٹل کارڈز فینسی (Total Cards)
                </h3>
                <p>
                  ایک راؤنڈ کم سے کم 5 اور زیادہ سے زیادہ 17 پتوں میں ختم ہوتا ہے۔
                  <br />
                  • <strong>Over / Under 10.5 Cards</strong> (1.90)
                  <br />
                  • <strong>Odd / Even Cards</strong> (جفت یا طاق)
                  <br />
                  • <strong>5 سے 8 کارڈز، 9 سے 12 کارڈز، یا 13 سے 17 کارڈز</strong>
                </p>

                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
                  4. ٹوٹل پوائنٹس (Total Points)
                </h3>
                <p>
                  Ace کا 1 پوائنٹ، 2 سے 10 تک وہی نمبر، Jack (غلام) کے 11 پوائنٹس اور Queen (بیگم) کے 12 پوائنٹس گنے جاتے ہیں۔
                  کل پوائنٹس پر Over 70.5 یا Under 70.5 اور Odd/Even کی شرط لگتی ہے۔
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Got It / سمجھ گئے
          </button>
        </div>
      </div>
    </div>
  );
};
