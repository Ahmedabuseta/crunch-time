import { Onboarding, type OnboardingStep } from '@/components/ui/onboarding';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { useSession } from '@/lib/session';
import { withOpacity } from '@/theme/colors';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { BarChart3, Radio, Wallet } from 'lucide-react-native';
import React from 'react';

/** The till's mark, on a soft plate — reuses the asset the desktop ships. */
function LogoArt() {
  const primary = useColor('primary');
  return (
    <View
      style={{
        width: 200,
        height: 200,
        borderRadius: 100,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(primary, 0.12),
      }}
    >
      <Image
        source={require('../assets/images/logo.png')}
        style={{ width: 132, height: 132 }}
        contentFit='contain'
      />
    </View>
  );
}

function StepArt({ icon: Icon, color }: { icon: typeof BarChart3; color: string }) {
  return (
    <View
      style={{
        width: 176,
        height: 176,
        borderRadius: 88,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(color, 0.14),
      }}
    >
      <Icon color={color} size={76} />
    </View>
  );
}

export default function OnboardingScreen() {
  const { onboardingDone, completeOnboarding } = useSession();
  const primary = useColor('primary');
  const blue = useColor('blue');
  const green = useColor('green');

  if (onboardingDone) return <Redirect href='/setup' />;

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'كرنش تايم',
      description:
        'تطبيق صاحب المحل. تابع الطلبات والورديات والتقارير من الموبايل — وهو شغال على الكمبيوتر زي ما هو.',
      image: <LogoArt />,
    },
    {
      id: 'orders',
      title: 'الطلبات لحظة بلحظة',
      description:
        'أي طلب يتعمل من الموبايل يطلع تذكرة في المطبخ فوراً، ويظهر فوراً على شاشة الكاشير.',
      icon: <StepArt icon={Radio} color={primary} />,
    },
    {
      id: 'money',
      title: 'الفلوس والورديات',
      description:
        'افتح واقفل الوردية، سجّل حركات الدرج، واعمل استرداد — مع تقرير Z كامل في آخر اليوم.',
      icon: <StepArt icon={Wallet} color={green} />,
    },
    {
      id: 'anywhere',
      title: 'من أي مكان',
      description:
        'شغّل الخادم من إعدادات الكمبيوتر، ووصّل الموبايل على Tailscale — وهتتابع من بره المحل.',
      icon: <StepArt icon={BarChart3} color={blue} />,
    },
  ];

  return (
    <Onboarding
      steps={steps}
      onComplete={() => void completeOnboarding()}
      onSkip={() => void completeOnboarding()}
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
