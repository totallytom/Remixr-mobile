import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {
  Search as SearchIcon,
  X,
  ChevronDown,
  Music,
  User,
  Calendar,
} from 'lucide-react-native';

export type SearchCategory = 'all' | 'music' | 'users' | 'concerts';

const CATEGORY_OPTIONS: {
  value: SearchCategory;
  label: string;
  Icon: React.ComponentType<{ size: number; color: string }>;
}[] = [
  { value: 'all', label: 'All', Icon: SearchIcon },
  { value: 'music', label: 'Music', Icon: Music },
  { value: 'users', label: 'Users', Icon: User },
  { value: 'concerts', label: 'Concerts', Icon: Calendar },
];

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  category: SearchCategory;
  onCategoryChange: (category: SearchCategory) => void;
  placeholder?: string;
  isSearching?: boolean;
  disabled?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  onClear,
  category,
  onCategoryChange,
  placeholder = 'Search for music, people, or events...',
  isSearching = false,
  disabled = false,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const currentOption =
    CATEGORY_OPTIONS.find((o) => o.value === category) ?? CATEGORY_OPTIONS[0];
  const { Icon: CurrentIcon } = currentOption;

  return (
    <View className="flex-row w-full rounded-full bg-dark-800 border border-dark-600 overflow-hidden">
      {/* Category selector */}
      <TouchableOpacity
        onPress={() => setDropdownOpen(true)}
        className="flex-row items-center gap-2 px-4 py-3 border-r border-dark-600 bg-dark-700"
      >
        <CurrentIcon size={16} color="#9ca3af" />
        <Text className="text-sm font-medium text-white">{currentOption.label}</Text>
        <ChevronDown size={14} color="#9ca3af" />
      </TouchableOpacity>

      {/* Text input */}
      <View className="flex-1 flex-row items-center">
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#6b7280"
          editable={!disabled}
          returnKeyType="search"
          className="flex-1 py-3 pl-4 pr-10 text-white text-sm"
        />
        <View className="absolute right-3">
          {isSearching ? (
            <ActivityIndicator size="small" color="#a3e635" />
          ) : value ? (
            <TouchableOpacity onPress={onClear} className="p-1">
              <X size={18} color="#6b7280" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Dropdown — floats above content via Modal */}
      <Modal
        transparent
        visible={dropdownOpen}
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <Pressable className="flex-1" onPress={() => setDropdownOpen(false)}>
          <View
            className="absolute bg-dark-800 border border-dark-600 rounded-lg py-1.5"
            style={{ top: 140, left: 16, width: 192 }}
          >
            {CATEGORY_OPTIONS.map((opt) => {
              const { Icon } = opt;
              const active = category === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    onCategoryChange(opt.value);
                    setDropdownOpen(false);
                  }}
                  className={`flex-row items-center gap-2 px-3 py-2.5 ${active ? 'bg-lime-400/25' : ''}`}
                >
                  <Icon size={16} color={active ? '#a3e635' : '#9ca3af'} />
                  <Text className={`text-sm ${active ? 'text-lime-400' : 'text-white'}`}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

export default SearchBar;
