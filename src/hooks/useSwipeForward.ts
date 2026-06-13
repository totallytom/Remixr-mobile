import { useRef } from 'react';
import { PanResponder } from 'react-native';

const MIN_SWIPE_X = 60; // minimum horizontal travel
const MAX_SWIPE_Y = 0.5; // dy must be less than 50% of dx (keeps it horizontal)

export function useSwipeForward(onForward: () => void) {
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dy) < Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -MIN_SWIPE_X && Math.abs(gs.dy) < Math.abs(gs.dx) * MAX_SWIPE_Y) {
          onForward();
        }
      },
    })
  ).current;

  return panResponder.panHandlers;
}
