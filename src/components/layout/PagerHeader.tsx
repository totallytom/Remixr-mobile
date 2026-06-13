import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { MaterialTopTabNavigationProp } from '@react-navigation/material-top-tabs';
import { Medal, ListMusic, Search } from 'lucide-react-native';
import type { HomePagerParamList } from '../../navigation/HomePager';

type PagerNav = MaterialTopTabNavigationProp<HomePagerParamList>;

export default function PagerHeader() {
  const navigation = useNavigation<PagerNav>();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
      {/* Logo + wordmark */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image
          source={require('../../../assets/logo.png')}
          style={{ width: 36, height: 36, borderRadius: 18 }}
          resizeMode="cover"
        />
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>Remixr</Text>
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Charts')}
          style={{
            width: 38, height: 38, borderRadius: 19,
            backgroundColor: 'rgba(234,179,8,0.15)',
            borderWidth: 1, borderColor: 'rgba(234,179,8,0.45)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Medal size={18} color="#EAB308" strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Playlists')}
          style={{
            width: 38, height: 38, borderRadius: 19,
            backgroundColor: 'rgba(124,58,237,0.15)',
            borderWidth: 1, borderColor: 'rgba(167,139,250,0.45)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ListMusic size={18} color="#a78bfa" strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Search')}
          style={{
            width: 38, height: 38, borderRadius: 19,
            backgroundColor: 'rgba(255,255,255,0.07)',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Search size={18} color="#9ca3af" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
