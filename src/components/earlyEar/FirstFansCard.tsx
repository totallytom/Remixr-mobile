/** Artist analytics: the people who found your tracks earliest (Early Ear). */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { colors } from '../../theme';
import { getAvatarUrl } from '../../utils/avatar';
import { dateLocale } from '../../utils/dateLocale';
import { EarlyEarService, type FirstFan } from '../../services/earlyEarService';

const FirstFansCard: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [fans, setFans] = useState<FirstFan[] | null>(null);

  useEffect(() => {
    EarlyEarService.getFirstFans(10).then(setFans).catch(() => setFans([]));
  }, []);

  if (fans === null) return null;

  return (
    <View className="rounded-2xl border p-5 gap-3" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
      <View>
        <Text className="text-sm font-semibold" style={{ color: colors.text }}>{t('earlyEar.firstFans')}</Text>
        <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>{t('earlyEar.firstFansHint')}</Text>
      </View>
      {fans.length === 0 ? (
        <Text className="text-sm" style={{ color: colors.textMuted }}>{t('earlyEar.firstFansEmpty')}</Text>
      ) : (
        <View className="gap-3">
          {fans.map((f) => (
            <TouchableOpacity
              key={`${f.userId}-${f.trackTitle}`}
              className="flex-row items-center gap-3"
              onPress={() => navigation.navigate('ProfileById', { userId: f.userId })}
              accessibilityRole="button"
            >
              <Image source={{ uri: getAvatarUrl(f.avatar) }} style={{ width: 34, height: 34, borderRadius: 17 }} />
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-medium" numberOfLines={1} style={{ color: colors.text }}>@{f.username}</Text>
                <Text className="text-xs" numberOfLines={1} style={{ color: colors.textMuted }}>
                  {t('earlyEar.fanMeta', {
                    rank: f.likeRank,
                    title: f.trackTitle,
                    time: formatDistanceToNow(new Date(f.foundAt), { addSuffix: true, locale: dateLocale() }),
                  })}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

export default FirstFansCard;
