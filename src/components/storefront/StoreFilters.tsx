import React from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import { StoreFilters, StoreSortBy, LicenseType } from '../../services/storefrontService';
import { colors, radius, spacing, typography } from '../../theme';

interface StoreFiltersProps {
  filters: StoreFilters;
  genres: string[];
  onChange: (patch: Partial<StoreFilters>) => void;
}

const SORT_OPTIONS: { value: StoreSortBy; label: string }[] = [
  { value: 'newest',     label: 'Newest' },
  { value: 'popular',   label: 'Most Sold' },
  { value: 'price_asc', label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
];

const LICENSE_OPTIONS: { value: 'all' | LicenseType; label: string }[] = [
  { value: 'all',        label: 'All' },
  { value: 'personal',   label: 'Personal' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'exclusive',  label: 'Exclusive' },
];

const StoreFiltersBar: React.FC<StoreFiltersProps> = ({ filters, genres, onChange }) => {
  return (
    <View style={s.container}>
      {/* Search */}
      <View style={s.searchRow}>
        <Search size={16} color="rgba(255,255,255,0.3)" style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          value={filters.query}
          onChangeText={query => onChange({ query })}
          placeholder="Search tracks or artists…"
          placeholderTextColor="rgba(255,255,255,0.3)"
        />
        {filters.query.length > 0 && (
          <TouchableOpacity onPress={() => onChange({ query: '' })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={14} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        )}
      </View>

      {/* License filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chipContent}>
        {LICENSE_OPTIONS.map(opt => {
          const active = filters.licenseType === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[s.chip, active && s.chipActive]}
              onPress={() => onChange({ licenseType: opt.value })}
              activeOpacity={0.7}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sort + Genre row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chipContent}>
        {SORT_OPTIONS.map(opt => {
          const active = filters.sortBy === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[s.chip, active && s.chipActive]}
              onPress={() => onChange({ sortBy: opt.value })}
              activeOpacity={0.7}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Genre chips */}
        {genres.slice(0, 8).map(genre => {
          const active = filters.genre === genre;
          return (
            <TouchableOpacity
              key={genre}
              style={[s.chip, active && s.chipActive]}
              onPress={() => onChange({ genre: active ? null : genre })}
              activeOpacity={0.7}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>{genre}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.textWhite,
    padding: 0,
  },
  chipRow: {
    flexGrow: 0,
  },
  chipContent: {
    gap: spacing.sm,
    paddingHorizontal: 1,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: typography.fontWeight.medium,
  },
  chipTextActive: {
    color: '#000',
    fontWeight: typography.fontWeight.semibold,
  },
});

export default StoreFiltersBar;
