import { OnboardingArt } from '@/components/app/OnboardingArt';
import { Onboarding, type OnboardingStep } from '@/components/ui/onboarding';
import { useColor } from '@/hooks/useColor';
import { useSession } from '@/lib/session';
import { useRouter } from 'expo-router';
import { BarChart3, Radio, Wallet } from 'lucide-react-native';
import React from 'react';

export default function OnboardingScreen() {
  const { completeOnboarding } = useSession();
  const router = useRouter();
  const primary = useColor('primary');
  const blue = useColor('blue');
  const green = useColor('green');

  // Always renderable — the gate only sends first-run users here, but المزيد can
  // replay it. Finishing records the flag and moves on either way.
  const finish = async () => {
    await completeOnboarding();
    router.replace('/setup');
  };

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'كرنش تايم',
      description:
        'تطبيق صاحب المحل. تابع الطلبات والورديات والتقارير من الموبايل — وهو شغال على الكمبيوتر زي ما هو.',
      image: <OnboardingArt id='welcome' logo color={primary} size={210} />,
    },
    {
      id: 'orders',
      title: 'الطلبات لحظة بلحظة',
      description:
        'أي طلب يتعمل من الموبايل يطلع تذكرة في المطبخ فوراً، ويظهر فوراً على شاشة الكاشير.',
      icon: <OnboardingArt id='orders' icon={Radio} color={primary} size={190} />,
    },
    {
      id: 'money',
      title: 'الفلوس والورديات',
      description:
        'افتح واقفل الوردية، سجّل حركات الدرج، واعمل استرداد — مع تقرير Z كامل في آخر اليوم.',
      icon: <OnboardingArt id='money' icon={Wallet} color={green} size={190} />,
    },
    {
      id: 'anywhere',
      title: 'من أي مكان',
      description:
        'شغّل الخادم من إعدادات الكمبيوتر، ووصّل الموبايل على Tailscale — وهتتابع من بره المحل.',
      icon: <OnboardingArt id='anywhere' icon={BarChart3} color={blue} size={190} />,
    },
  ];

  return (
    <Onboarding
      steps={steps}
      onComplete={() => void finish()}
      onSkip={() => void finish()}
      showSkip
      showProgress
      swipeEnabled
      primaryButtonText='يلا نبدأ'
      nextButtonText='التالي'
      backButtonText='رجوع'
      skipButtonText='تخطَّ'
    />
  );
}
