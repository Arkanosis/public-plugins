=head1 LICENSE

Copyright [1999-2013] Wellcome Trust Sanger Institute and the EMBL-European Bioinformatics Institute

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

=cut

package EnsEMBL::Web::Configuration::Location;

use strict;

use previous qw(modify_tree);

sub modify_tree {
  my $self = shift;
  my $view = $self->get_node('View');
  
  $view->set('genoverse', 1);

  $self->PREV::modify_tree;
}

sub get_configurable_components {
  my $self       = shift;
  my $node       = shift;
  my $components = $self->SUPER::get_configurable_components($node, @_);
  
  push @{$components->[0]}, 'genoverse' if $node && $node->get('genoverse');
  
  return $components;
}

1;
